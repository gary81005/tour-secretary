-- M2 第 4 步：xlsx 匯入（docs/adr/0008）。
-- import_trip 在同一個 transaction 寫入整份檔案；附加／覆蓋到既有行程時記一筆 trip_imports，
-- 30 天內、尚未再次匯入前可以用 undo_import 還原。
-- 錯誤碼：P0002 找不到（或沒有權限）；22023 參數不合法；P0001 import_not_undoable。
-- 這個檔案可以重複執行。

DO $$ BEGIN
  CREATE TYPE public.trip_import_mode AS ENUM ('append', 'overwrite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- trip_imports：匯入紀錄。只透過 import_trip / undo_import 寫入，畫面只讀。
-- 新建行程的匯入不記錄（要復原就把整趟移到垃圾桶）。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  mode public.trip_import_mode NOT NULL,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  -- 匯入前的起訖日（行程被延長時，復原要縮回來）
  previous_start_date date NOT NULL,
  previous_end_date date NOT NULL,
  -- 這次新增的資料；fallbacks 只記掛在「既有項目」上的（新項目的備案隨項目一起軟刪除）
  created_day_ids uuid[] NOT NULL DEFAULT '{}',
  created_item_ids uuid[] NOT NULL DEFAULT '{}',
  created_fallback_ids uuid[] NOT NULL DEFAULT '{}',
  created_stay_ids uuid[] NOT NULL DEFAULT '{}',
  created_note_ids uuid[] NOT NULL DEFAULT '{}',
  created_constraint_ids uuid[] NOT NULL DEFAULT '{}',
  -- 覆蓋時被軟刪除的資料
  replaced_item_ids uuid[] NOT NULL DEFAULT '{}',
  replaced_stay_ids uuid[] NOT NULL DEFAULT '{}',
  replaced_note_ids uuid[] NOT NULL DEFAULT '{}',
  replaced_constraint_ids uuid[] NOT NULL DEFAULT '{}',
  -- 被改掉的城市：[{ "day_id": uuid, "city": text | null }]
  previous_cities jsonb NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS trip_imports_trip_id_created_at_idx
  ON public.trip_imports (trip_id, created_at DESC);

ALTER TABLE public.trip_imports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.trip_imports FROM anon, authenticated;
GRANT SELECT ON public.trip_imports TO authenticated;

DROP POLICY IF EXISTS "trip_imports: members can read" ON public.trip_imports;
CREATE POLICY "trip_imports: members can read"
  ON public.trip_imports FOR SELECT TO authenticated
  USING (public.can_access_trip(trip_id));

-- ---------------------------------------------------------------------------
-- import_trip：把匯入預覽確認後的資料寫進行程。
--
-- p_trip_id 是 null：新建行程（名稱 p_name、預設時區 p_timezone，日期範圍取檔案的第一天到最後一天）。
-- 否則依 p_mode 附加或覆蓋到既有行程：
-- - 檔案日期超出範圍時延長行程（最多 60 天），補上中間缺少的天。
-- - 城市：附加只填原本空白的天，覆蓋是檔案有寫就蓋過去。
-- - 覆蓋：檔案涵蓋的日期，既有項目軟刪除；p_payload 有 stays／notes／constraints 陣列時（檔案有那張
--   工作表），那一類既有資料全部軟刪除。
-- - 新項目排在同一天、同時段的最後；提醒事項排在最後。
--
-- p_payload（由 Server Action 以 zod 驗證後組成）：
-- {
--   "days": [{ "date": "2027-03-05", "city": "東京" | null }],
--   "items": [{ "ref": "行程!D3", "date", "title", "time_slot", "category",
--               "start_time", "end_time", "description" }],
--   "fallbacks": [{ "item_ref": "行程!D3" | null, "item_id": uuid | null, "condition", "alternative" }],
--   "stays": [{ "name", "check_in", "check_out", "address", "status", "confirmation_code", "url", "note" }] | null,
--   "notes": [{ "topic", "content" }] | null,
--   "constraints": [{ "kind", "subject", "content" }] | null
-- }
-- 備案用 item_ref 掛到這次匯入的項目，或用 item_id 掛到行程裡的既有項目（附加模式，Q16）。
--
-- security definer：days 與 trips 的日期沒有開放直接寫入，所以先用 can_access_trip() 檢查權限。
-- 長度、網址、時間範圍等規則由各資料表的 check constraint 把關。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.import_trip(
  p_payload jsonb,
  p_trip_id uuid DEFAULT NULL,
  p_mode public.trip_import_mode DEFAULT 'append',
  p_name text DEFAULT NULL,
  p_timezone text DEFAULT NULL
)
RETURNS TABLE (trip_id uuid, import_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_trip_id uuid := p_trip_id;
  v_import_id uuid;
  v_mode public.trip_import_mode := coalesce(p_mode, 'append');
  v_file_start date;
  v_file_end date;
  v_start date;
  v_end date;
  v_created_days uuid[] := '{}';
  v_created_items uuid[] := '{}';
  v_created_fallbacks uuid[] := '{}';
  v_created_stays uuid[] := '{}';
  v_created_notes uuid[] := '{}';
  v_created_constraints uuid[] := '{}';
  v_replaced_items uuid[] := '{}';
  v_replaced_stays uuid[] := '{}';
  v_replaced_notes uuid[] := '{}';
  v_replaced_constraints uuid[] := '{}';
  v_previous_cities jsonb := '[]';
  v_refs jsonb := '{}';
  v_note_position integer;
  v_day_id uuid;
  v_item_id uuid;
  v_fallback_id uuid;
  v_position integer;
  r record;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(coalesce(p_payload -> 'days', '[]')) <> 'array'
     OR jsonb_typeof(coalesce(p_payload -> 'items', '[]')) <> 'array'
     OR jsonb_typeof(coalesce(p_payload -> 'fallbacks', '[]')) <> 'array'
     OR jsonb_array_length(coalesce(p_payload -> 'items', '[]')) > 2000 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  SELECT min((d ->> 'date')::date), max((d ->> 'date')::date)
  INTO v_file_start, v_file_end
  FROM jsonb_array_elements(coalesce(p_payload -> 'days', '[]')) AS d;

  -- 行程與天 -----------------------------------------------------------------

  IF v_trip_id IS NULL THEN
    IF v_file_start IS NULL THEN
      RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
    END IF;
    IF v_file_end - v_file_start >= 60 THEN
      RAISE EXCEPTION 'trip_too_long' USING ERRCODE = '22023';
    END IF;
    -- create_trip 檢查登入、建立成員與每一天。
    v_trip_id := public.create_trip(p_name, v_file_start, v_file_end, p_timezone);
    v_mode := 'append';
  ELSE
    IF NOT public.can_access_trip(v_trip_id) THEN
      RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
    END IF;

    -- 鎖住行程，避免和其他匯入、修改日期同時進行。
    SELECT t.start_date, t.end_date INTO v_start, v_end
    FROM public.trips t WHERE t.id = v_trip_id FOR UPDATE;

    INSERT INTO public.trip_imports (trip_id, mode, created_by, previous_start_date, previous_end_date)
    VALUES (v_trip_id, v_mode, (SELECT auth.uid()), v_start, v_end)
    RETURNING id INTO v_import_id;

    -- least / greatest 會略過 null（只上傳「備案」時檔案沒有日期）。
    v_file_start := least(v_start, v_file_start);
    v_file_end := greatest(v_end, v_file_end);
    IF v_file_end - v_file_start >= 60 THEN
      RAISE EXCEPTION 'trip_too_long' USING ERRCODE = '22023';
    END IF;

    WITH inserted AS (
      INSERT INTO public.days (trip_id, date)
      SELECT v_trip_id, v_file_start + offset_days
      FROM generate_series(0, v_file_end - v_file_start) AS offset_days
      WHERE NOT EXISTS (
        SELECT 1 FROM public.days d
        WHERE d.trip_id = v_trip_id AND d.date = v_file_start + offset_days
      )
      RETURNING id
    )
    SELECT coalesce(array_agg(id), '{}') INTO v_created_days FROM inserted;

    UPDATE public.trips
    SET start_date = v_file_start, end_date = v_file_end
    WHERE id = v_trip_id AND (start_date <> v_file_start OR end_date <> v_file_end);
  END IF;

  WITH file_days AS (
    SELECT (d ->> 'date')::date AS date, nullif(btrim(d ->> 'city'), '') AS city
    FROM jsonb_array_elements(coalesce(p_payload -> 'days', '[]')) AS d
  ),
  changed AS (
    SELECT dy.id, dy.city AS old_city, f.city AS new_city
    FROM public.days dy
    JOIN file_days f ON f.date = dy.date
    WHERE dy.trip_id = v_trip_id
      AND f.city IS NOT NULL
      AND dy.city IS DISTINCT FROM f.city
      AND (v_mode = 'overwrite' OR dy.city IS NULL)
  ),
  updated AS (
    UPDATE public.days dy SET city = changed.new_city
    FROM changed WHERE dy.id = changed.id
    RETURNING changed.id, changed.old_city
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('day_id', id, 'city', old_city)), '[]')
  INTO v_previous_cities FROM updated;

  -- 覆蓋：軟刪除被取代的資料 -------------------------------------------------

  IF v_mode = 'overwrite' THEN
    WITH replaced AS (
      UPDATE public.items i SET deleted_at = now()
      FROM public.days dy
      WHERE i.day_id = dy.id
        AND dy.trip_id = v_trip_id
        AND i.deleted_at IS NULL
        AND dy.date IN (
          SELECT (d ->> 'date')::date
          FROM jsonb_array_elements(coalesce(p_payload -> 'days', '[]')) AS d
        )
      RETURNING i.id
    )
    SELECT coalesce(array_agg(id), '{}') INTO v_replaced_items FROM replaced;

    IF jsonb_typeof(p_payload -> 'stays') = 'array' THEN
      WITH replaced AS (
        UPDATE public.stays SET deleted_at = now()
        WHERE trip_id = v_trip_id AND deleted_at IS NULL
        RETURNING id
      )
      SELECT coalesce(array_agg(id), '{}') INTO v_replaced_stays FROM replaced;
    END IF;

    IF jsonb_typeof(p_payload -> 'notes') = 'array' THEN
      WITH replaced AS (
        UPDATE public.trip_notes SET deleted_at = now()
        WHERE trip_id = v_trip_id AND deleted_at IS NULL
        RETURNING id
      )
      SELECT coalesce(array_agg(id), '{}') INTO v_replaced_notes FROM replaced;
    END IF;

    IF jsonb_typeof(p_payload -> 'constraints') = 'array' THEN
      WITH replaced AS (
        UPDATE public.traveler_constraints SET deleted_at = now()
        WHERE trip_id = v_trip_id AND deleted_at IS NULL
        RETURNING id
      )
      SELECT coalesce(array_agg(id), '{}') INTO v_replaced_constraints FROM replaced;
    END IF;
  END IF;

  -- 項目：依檔案順序，排在同一天、同時段的最後 -------------------------------

  FOR r IN
    SELECT x.*
    FROM ROWS FROM (
      jsonb_to_recordset(coalesce(p_payload -> 'items', '[]')) AS (
        ref text, date date, title text, time_slot public.time_slot,
        category public.item_category, start_time time, end_time time, description text
      )
    ) WITH ORDINALITY AS x (
      ref, date, title, time_slot, category, start_time, end_time, description, ordinality
    )
    ORDER BY x.ordinality
  LOOP
    SELECT d.id INTO v_day_id FROM public.days d WHERE d.trip_id = v_trip_id AND d.date = r.date;
    IF v_day_id IS NULL OR r.ref IS NULL OR v_refs ? r.ref THEN
      RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(max(i.position) + 1, 0) INTO v_position
    FROM public.items i
    WHERE i.day_id = v_day_id AND i.time_slot = r.time_slot AND i.deleted_at IS NULL;

    INSERT INTO public.items (
      trip_id, day_id, title, time_slot, category, start_time, end_time, description, position
    )
    VALUES (
      v_trip_id, v_day_id, btrim(r.title), r.time_slot, r.category, r.start_time, r.end_time,
      r.description, v_position
    )
    RETURNING id INTO v_item_id;

    v_refs := v_refs || jsonb_build_object(r.ref, v_item_id);
    v_created_items := v_created_items || v_item_id;
  END LOOP;

  -- 備案 -----------------------------------------------------------------------

  FOR r IN
    SELECT x.*
    FROM ROWS FROM (
      jsonb_to_recordset(coalesce(p_payload -> 'fallbacks', '[]')) AS (
        item_ref text, item_id uuid, condition text, alternative text
      )
    ) WITH ORDINALITY AS x (item_ref, item_id, condition, alternative, ordinality)
    ORDER BY x.ordinality
  LOOP
    IF r.item_ref IS NOT NULL THEN
      v_item_id := (v_refs ->> r.item_ref)::uuid;
    ELSE
      SELECT i.id INTO v_item_id
      FROM public.items i
      WHERE i.id = r.item_id AND i.trip_id = v_trip_id AND i.deleted_at IS NULL;
    END IF;
    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(max(f.position) + 1, 0) INTO v_position
    FROM public.fallbacks f WHERE f.item_id = v_item_id;

    INSERT INTO public.fallbacks (trip_id, item_id, condition, alternative, position)
    VALUES (v_trip_id, v_item_id, nullif(btrim(r.condition), ''), btrim(r.alternative), v_position)
    RETURNING id INTO v_fallback_id;

    IF r.item_ref IS NULL THEN
      v_created_fallbacks := v_created_fallbacks || v_fallback_id;
    END IF;
  END LOOP;

  -- 住宿、提醒事項、旅伴限制 ---------------------------------------------------

  WITH inserted AS (
    INSERT INTO public.stays (
      trip_id, name, check_in, check_out, address, status, confirmation_code, url, note
    )
    SELECT v_trip_id, btrim(x.name), x.check_in, x.check_out, x.address,
           coalesce(x.status, 'candidate'), x.confirmation_code, x.url, x.note
    FROM jsonb_to_recordset(coalesce(p_payload -> 'stays', '[]')) AS x (
      name text, check_in date, check_out date, address text, status public.stay_status,
      confirmation_code text, url text, note text
    )
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_created_stays FROM inserted;

  SELECT coalesce(max(n.position) + 1, 0) INTO v_note_position
  FROM public.trip_notes n WHERE n.trip_id = v_trip_id AND n.deleted_at IS NULL;

  WITH inserted AS (
    INSERT INTO public.trip_notes (trip_id, topic, content, position)
    SELECT v_trip_id, btrim(x.topic), x.content, v_note_position + (x.ordinality - 1)::integer
    FROM ROWS FROM (
      jsonb_to_recordset(coalesce(p_payload -> 'notes', '[]')) AS (topic text, content text)
    ) WITH ORDINALITY AS x (topic, content, ordinality)
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_created_notes FROM inserted;

  WITH inserted AS (
    INSERT INTO public.traveler_constraints (trip_id, kind, subject, content)
    SELECT v_trip_id, x.kind, nullif(btrim(x.subject), ''), btrim(x.content)
    FROM jsonb_to_recordset(coalesce(p_payload -> 'constraints', '[]')) AS x (
      kind public.traveler_constraint_kind, subject text, content text
    )
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_created_constraints FROM inserted;

  IF v_import_id IS NOT NULL THEN
    UPDATE public.trip_imports
    SET created_day_ids = v_created_days,
        created_item_ids = v_created_items,
        created_fallback_ids = v_created_fallbacks,
        created_stay_ids = v_created_stays,
        created_note_ids = v_created_notes,
        created_constraint_ids = v_created_constraints,
        replaced_item_ids = v_replaced_items,
        replaced_stay_ids = v_replaced_stays,
        replaced_note_ids = v_replaced_notes,
        replaced_constraint_ids = v_replaced_constraints,
        previous_cities = v_previous_cities
    WHERE id = v_import_id;
  END IF;

  RETURN QUERY SELECT v_trip_id, v_import_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_trip(
  jsonb, uuid, public.trip_import_mode, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_trip(
  jsonb, uuid, public.trip_import_mode, text, text
) TO authenticated;

-- ---------------------------------------------------------------------------
-- undo_import：復原上次匯入（Q15）。只有行程「最近一次」的匯入、30 天內、還沒復原過才可以。
-- - 這次新增的資料軟刪除；掛在既有項目上的備案刪除。
-- - 被覆蓋的資料還原，城市改回原值。
-- - 延長出來的天從最外側往內刪，遇到還有其他項目的天就停止，起訖日跟著剩下的天調整。
-- 匯入後才手動修改的內容（例如編輯過匯入的項目）也會一起被復原，由畫面的確認對話框提醒。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.undo_import(p_import_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_import public.trip_imports%ROWTYPE;
BEGIN
  SELECT * INTO v_import FROM public.trip_imports WHERE id = p_import_id;
  IF NOT FOUND OR NOT public.can_access_trip(v_import.trip_id) THEN
    RAISE EXCEPTION 'import not found' USING ERRCODE = 'P0002';
  END IF;

  -- 鎖住行程，再確認狀態（避免兩個人同時復原，或復原時有人在匯入）。
  PERFORM 1 FROM public.trips t WHERE t.id = v_import.trip_id FOR UPDATE;
  SELECT * INTO v_import FROM public.trip_imports WHERE id = p_import_id;
  IF v_import.undone_at IS NOT NULL
     OR v_import.created_at < now() - INTERVAL '30 days'
     OR EXISTS (
       SELECT 1 FROM public.trip_imports other
       WHERE other.trip_id = v_import.trip_id AND other.created_at > v_import.created_at
     ) THEN
    RAISE EXCEPTION 'import_not_undoable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.items SET deleted_at = now()
  WHERE id = ANY (v_import.created_item_ids) AND deleted_at IS NULL;
  UPDATE public.stays SET deleted_at = now()
  WHERE id = ANY (v_import.created_stay_ids) AND deleted_at IS NULL;
  UPDATE public.trip_notes SET deleted_at = now()
  WHERE id = ANY (v_import.created_note_ids) AND deleted_at IS NULL;
  UPDATE public.traveler_constraints SET deleted_at = now()
  WHERE id = ANY (v_import.created_constraint_ids) AND deleted_at IS NULL;
  DELETE FROM public.fallbacks WHERE id = ANY (v_import.created_fallback_ids);

  UPDATE public.items SET deleted_at = NULL WHERE id = ANY (v_import.replaced_item_ids);
  UPDATE public.stays SET deleted_at = NULL WHERE id = ANY (v_import.replaced_stay_ids);
  UPDATE public.trip_notes SET deleted_at = NULL WHERE id = ANY (v_import.replaced_note_ids);
  UPDATE public.traveler_constraints SET deleted_at = NULL
  WHERE id = ANY (v_import.replaced_constraint_ids);

  UPDATE public.days d SET city = previous.city
  FROM jsonb_to_recordset(v_import.previous_cities) AS previous (day_id uuid, city text)
  WHERE d.id = previous.day_id;

  -- 延長出來的天都在行程的頭或尾；每次刪掉最外側、沒有項目的新天，直到刪不動為止。
  -- 已軟刪除的項目（例如剛剛復原掉的）會隨著天一起永久刪除。
  LOOP
    DELETE FROM public.days d
    WHERE d.trip_id = v_import.trip_id
      AND d.id = ANY (v_import.created_day_ids)
      AND d.date IN (
        (SELECT min(x.date) FROM public.days x WHERE x.trip_id = v_import.trip_id),
        (SELECT max(x.date) FROM public.days x WHERE x.trip_id = v_import.trip_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.items i WHERE i.day_id = d.id AND i.deleted_at IS NULL
      );
    EXIT WHEN NOT FOUND;
  END LOOP;

  UPDATE public.trips t
  SET start_date = bounds.start_date, end_date = bounds.end_date
  FROM (
    SELECT min(d.date) AS start_date, max(d.date) AS end_date
    FROM public.days d WHERE d.trip_id = v_import.trip_id
  ) AS bounds
  WHERE t.id = v_import.trip_id
    AND (t.start_date <> bounds.start_date OR t.end_date <> bounds.end_date);

  UPDATE public.trip_imports SET undone_at = now() WHERE id = p_import_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_import(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- purge_deleted_rows：加上清除 30 天前的匯入紀錄（被覆蓋的資料這時也已永久刪除，無法復原）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_deleted_rows()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.trips WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.items WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.stays WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.trip_notes WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.traveler_constraints WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.trip_imports WHERE created_at < now() - INTERVAL '30 days';
$$;

REVOKE EXECUTE ON FUNCTION public.purge_deleted_rows() FROM PUBLIC, anon, authenticated;
