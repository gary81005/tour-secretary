-- M5 第 3 步：只有主辦人能做的操作（ADR 0005「M5 旅伴與權限」Q2、Q3、Q6）。
-- 原則：會整批刪掉別人內容的操作只有主辦人能做。
-- - 只有主辦人：移到垃圾桶、從垃圾桶復原（trips.deleted_at）、平移、改起訖日、刪除一天、
--   匯入「覆蓋」、復原上次匯入。永久刪除原本就只有主辦人（"trips: owner can delete"）。
-- - 旅伴也能做：改名稱與預設時區、插入一天、附加匯入，以及項目等內容的增刪改（不變）。
-- - 行程在垃圾桶時，旅伴看不到（垃圾桶列表只剩自己是主辦人的行程）。
-- 另外：匯入時間改用取得行程鎖之後的時間；刪掉沒用到的 trip_imports.previous_start_date / previous_end_date。
-- 錯誤碼：不是成員或行程在垃圾桶裡 P0002；是旅伴但不是主辦人 42501 owner_only。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- ensure_trip_owner：主辦人專屬函式開頭的檢查。只給其他 security definer 函式呼叫。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_trip_owner(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_access_trip(p_trip_id) THEN
    RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_trip_owner(p_trip_id) THEN
    RAISE EXCEPTION 'owner_only' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_trip_owner(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- trips：垃圾桶裡的行程只有主辦人看得到；deleted_at 只有主辦人能改。
-- 旅伴的 update policy 只涵蓋不在垃圾桶、改完也不在垃圾桶的行程，所以旅伴把 deleted_at
-- 填上值會被 WITH CHECK 擋下（42501）。主辦人另外一條 policy，可以移到垃圾桶與復原。
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "trips: members can read" ON public.trips;
DROP POLICY IF EXISTS "trips: members can read, owner can read trashed" ON public.trips;
CREATE POLICY "trips: members can read, owner can read trashed"
  ON public.trips FOR SELECT TO authenticated
  USING (public.is_trip_member(id) AND (deleted_at IS NULL OR public.is_trip_owner(id)));

DROP POLICY IF EXISTS "trips: members can update" ON public.trips;
DROP POLICY IF EXISTS "trips: members can update active trips" ON public.trips;
CREATE POLICY "trips: members can update active trips"
  ON public.trips FOR UPDATE TO authenticated
  USING (public.is_trip_member(id) AND deleted_at IS NULL)
  WITH CHECK (public.is_trip_member(id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "trips: owner can update" ON public.trips;
CREATE POLICY "trips: owner can update"
  ON public.trips FOR UPDATE TO authenticated
  USING (public.is_trip_owner(id))
  WITH CHECK (public.is_trip_owner(id));

-- ---------------------------------------------------------------------------
-- 平移、改起訖日、刪除一天：只有主辦人。其餘與原本相同
-- （shift_trip：20261106000005；set_trip_dates、delete_day：20261106000003）。
-- insert_day_after 不變，旅伴也能插入一天。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shift_trip(p_trip_id uuid, p_start_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer;
BEGIN
  PERFORM public.ensure_trip_owner(p_trip_id);

  -- for update：鎖住這趟行程，同時進來的日期異動排隊執行。
  SELECT p_start_date - t.start_date INTO v_days
  FROM public.trips t
  WHERE t.id = p_trip_id
  FOR UPDATE;

  IF v_days IS NULL OR v_days = 0 THEN
    RETURN;
  END IF;

  UPDATE public.trips
  SET start_date = start_date + v_days, end_date = end_date + v_days
  WHERE id = p_trip_id;
  -- days_trip_date_key 是 deferrable，整批改日期時中途撞到同一天沒關係。
  UPDATE public.days SET date = date + v_days WHERE trip_id = p_trip_id;
  UPDATE public.stays
  SET check_in = check_in + v_days, check_out = check_out + v_days
  WHERE trip_id = p_trip_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_trip_dates(
  p_trip_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_blocked text;
BEGIN
  PERFORM public.ensure_trip_owner(p_trip_id);
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
     OR p_end_date - p_start_date >= 60 THEN
    RAISE EXCEPTION 'invalid_range' USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(DISTINCT d.date::text, ',' ORDER BY d.date::text) INTO v_blocked
  FROM public.days d
  JOIN public.items i ON i.day_id = d.id AND i.deleted_at IS NULL
  WHERE d.trip_id = p_trip_id AND (d.date < p_start_date OR d.date > p_end_date);
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'days_have_items' USING ERRCODE = 'P0001', DETAIL = v_blocked;
  END IF;

  DELETE FROM public.days
  WHERE trip_id = p_trip_id AND (date < p_start_date OR date > p_end_date);

  INSERT INTO public.days (trip_id, date)
  SELECT p_trip_id, p_start_date + offset_days
  FROM generate_series(0, p_end_date - p_start_date) AS offset_days
  WHERE NOT EXISTS (
    SELECT 1 FROM public.days d
    WHERE d.trip_id = p_trip_id AND d.date = p_start_date + offset_days
  );

  UPDATE public.trips SET start_date = p_start_date, end_date = p_end_date WHERE id = p_trip_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_day(p_day_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip_id uuid;
  v_date date;
  v_day_count integer;
BEGIN
  SELECT d.trip_id, d.date INTO v_trip_id, v_date FROM public.days d WHERE d.id = p_day_id;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'day not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.ensure_trip_owner(v_trip_id);

  SELECT count(*) INTO v_day_count FROM public.days WHERE trip_id = v_trip_id;
  IF v_day_count <= 1 THEN
    RAISE EXCEPTION 'last_day' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.days WHERE id = p_day_id;

  UPDATE public.stays SET deleted_at = coalesce(deleted_at, now())
  WHERE trip_id = v_trip_id AND check_in = v_date AND check_out = v_date + 1;

  UPDATE public.stays
  SET check_in = check_in - CASE WHEN check_in > v_date THEN 1 ELSE 0 END,
      check_out = check_out - 1
  WHERE trip_id = v_trip_id
    AND check_out > v_date
    AND NOT (check_in = v_date AND check_out = v_date + 1);

  UPDATE public.days SET date = date - 1 WHERE trip_id = v_trip_id AND date > v_date;
  UPDATE public.trips SET end_date = end_date - 1 WHERE id = v_trip_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- import_trip：覆蓋只有主辦人；匯入時間改用取得行程鎖之後的時間。其餘與 20261111000002 相同。
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
    -- 附加所有旅伴都能做；覆蓋只有主辦人能做。
    IF v_mode = 'overwrite' THEN
      PERFORM public.ensure_trip_owner(v_trip_id);
    ELSIF NOT public.can_access_trip(v_trip_id) THEN
      RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
    END IF;

    -- 鎖住行程，避免和其他匯入、修改日期同時進行。
    SELECT t.start_date, t.end_date INTO v_start, v_end
    FROM public.trips t WHERE t.id = v_trip_id FOR UPDATE;

    -- 匯入時間用取得行程鎖之後的時間，不用交易開始時間（now()）：兩位旅伴幾乎同時匯入時，
    -- 後取得鎖的那次一定比較晚，undo_import 判斷「最近一次匯入」才不會顛倒。
    INSERT INTO public.trip_imports (trip_id, mode, created_by, created_at)
    VALUES (v_trip_id, v_mode, (SELECT auth.uid()), clock_timestamp())
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
    -- 沒有住宿工作表時是 JSON null（20261111000002），只有陣列才展開。提醒事項、旅伴限制同理。
    FROM jsonb_to_recordset(
      CASE WHEN jsonb_typeof(p_payload -> 'stays') = 'array'
        THEN p_payload -> 'stays'
        ELSE '[]'
      END
    ) AS x (
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
      jsonb_to_recordset(
        CASE WHEN jsonb_typeof(p_payload -> 'notes') = 'array'
          THEN p_payload -> 'notes'
          ELSE '[]'
        END
      ) AS (topic text, content text)
    ) WITH ORDINALITY AS x (topic, content, ordinality)
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_created_notes FROM inserted;

  WITH inserted AS (
    INSERT INTO public.traveler_constraints (trip_id, kind, subject, content)
    SELECT v_trip_id, x.kind, nullif(btrim(x.subject), ''), btrim(x.content)
    FROM jsonb_to_recordset(
      CASE WHEN jsonb_typeof(p_payload -> 'constraints') = 'array'
        THEN p_payload -> 'constraints'
        ELSE '[]'
      END
    ) AS x (
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

-- ---------------------------------------------------------------------------
-- undo_import：只有主辦人。其餘與 20261110000001 相同。
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
  PERFORM public.ensure_trip_owner(v_import.trip_id);

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

-- ---------------------------------------------------------------------------
-- trip_imports：復原用剩下的天重算起訖日，匯入前的起訖日沒有用到。
-- ---------------------------------------------------------------------------

ALTER TABLE public.trip_imports
  DROP COLUMN IF EXISTS previous_start_date,
  DROP COLUMN IF EXISTS previous_end_date;
