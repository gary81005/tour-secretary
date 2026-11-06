-- M1 第 9 步：修改行程日期與天數（Q15）。
-- trips.start_date/end_date、days.date 沒有開放直接改（20261105000002_rls.sql 的欄位層級 grant），
-- 一律透過這裡的函式，天數才不會和日期範圍脫節；住宿的日期也一起調整。
-- security definer：days 沒有開放 insert/delete，所以每個函式都先用 can_access_trip() 檢查權限。
-- 錯誤碼：P0002 找不到（或沒有權限）；22023 參數不合法（訊息是原因）；P0001 days_have_items。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- shift_trip：整趟平移 p_days 天（例如延後一週）。每天的內容跟著第 N 天移動。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shift_trip(p_trip_id uuid, p_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.can_access_trip(p_trip_id) THEN
    RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_days IS NULL OR p_days = 0 THEN
    RETURN;
  END IF;
  IF abs(p_days) > 3650 THEN
    RAISE EXCEPTION 'invalid_shift' USING ERRCODE = '22023';
  END IF;

  UPDATE public.trips
  SET start_date = start_date + p_days, end_date = end_date + p_days
  WHERE id = p_trip_id;
  -- days_trip_date_key 是 deferrable，整批改日期時中途撞到同一天沒關係。
  UPDATE public.days SET date = date + p_days WHERE trip_id = p_trip_id;
  UPDATE public.stays
  SET check_in = check_in + p_days, check_out = check_out + p_days
  WHERE trip_id = p_trip_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- set_trip_dates：修改起訖日，以日期對應：保留還在新範圍內的天，補上缺少的日期。
-- 要刪掉的天只要還有項目（未刪除）就整筆擋下，detail 是那些日期（逗號分隔）。
-- ---------------------------------------------------------------------------

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
  IF NOT public.can_access_trip(p_trip_id) THEN
    RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
  END IF;
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

-- ---------------------------------------------------------------------------
-- insert_day_after：在某一天後面插入一天，之後的日期往後移一天、回程日延後一天。
-- 插入點之後的住宿一起往後移；跨過插入點的住宿多住一晚。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_day_after(p_day_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trip_id uuid;
  v_date date;
  v_day_count integer;
  v_new_day_id uuid;
BEGIN
  SELECT d.trip_id, d.date INTO v_trip_id, v_date FROM public.days d WHERE d.id = p_day_id;
  IF v_trip_id IS NULL OR NOT public.can_access_trip(v_trip_id) THEN
    RAISE EXCEPTION 'day not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_day_count FROM public.days WHERE trip_id = v_trip_id;
  IF v_day_count >= 60 THEN
    RAISE EXCEPTION 'trip_too_long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.days SET date = date + 1 WHERE trip_id = v_trip_id AND date > v_date;
  UPDATE public.stays
  SET check_in = check_in + CASE WHEN check_in > v_date THEN 1 ELSE 0 END,
      check_out = check_out + 1
  WHERE trip_id = v_trip_id AND check_out > v_date;

  INSERT INTO public.days (trip_id, date) VALUES (v_trip_id, v_date + 1)
  RETURNING id INTO v_new_day_id;

  UPDATE public.trips SET end_date = end_date + 1 WHERE id = v_trip_id;
  RETURN v_new_day_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- delete_day：刪除一天（連同它的項目），之後的日期往前移一天、回程日提早一天。
-- 至少要留一天。只住被刪那一晚的住宿改成軟刪除（往前移會變成入住日 = 退房日）。
-- ---------------------------------------------------------------------------

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
  IF v_trip_id IS NULL OR NOT public.can_access_trip(v_trip_id) THEN
    RAISE EXCEPTION 'day not found' USING ERRCODE = 'P0002';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.shift_trip(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_trip_dates(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.insert_day_after(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_day(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_trip(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_dates(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_day_after(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_day(uuid) TO authenticated;
