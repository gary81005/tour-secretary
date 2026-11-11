-- 修正 import_trip（20261110000001_trip_imports.sql）：檔案沒有住宿／提醒事項／旅伴限制工作表時，
-- p_payload 的 stays／notes／constraints 是 JSON null（ADR 0008：沒有那張工作表就不動既有資料）。
-- p_payload -> 'stays' 這時是 jsonb 的 'null'，不是 SQL 的 NULL，coalesce(..., '[]') 擋不住，
-- jsonb_to_recordset 會拋出 22023（cannot call jsonb_to_recordset on a non-array），畫面顯示「發生錯誤」。
-- 改成只有陣列才展開，其他一律當作空陣列。函式其餘部分不變。
-- 這個檔案可以重複執行。

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
    FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(p_payload -> 'stays') = 'array' THEN p_payload -> 'stays' ELSE '[]' END) AS x (
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
      jsonb_to_recordset(CASE WHEN jsonb_typeof(p_payload -> 'notes') = 'array' THEN p_payload -> 'notes' ELSE '[]' END) AS (topic text, content text)
    ) WITH ORDINALITY AS x (topic, content, ordinality)
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_created_notes FROM inserted;

  WITH inserted AS (
    INSERT INTO public.traveler_constraints (trip_id, kind, subject, content)
    SELECT v_trip_id, x.kind, nullif(btrim(x.subject), ''), btrim(x.content)
    FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(p_payload -> 'constraints') = 'array' THEN p_payload -> 'constraints' ELSE '[]' END) AS x (
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
