-- M1 行程函式：建立行程、每日清理垃圾桶。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- create_trip：建立行程、把自己加為 owner、依起訖日產生每一天
-- security definer：trips / trip_members / days 都沒有開放直接 insert。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_trip(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_timezone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_trip_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.trips (name, start_date, end_date, default_timezone, created_by)
  VALUES (btrim(p_name), p_start_date, p_end_date, p_timezone, v_user_id)
  RETURNING id INTO v_trip_id;

  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (v_trip_id, v_user_id, 'owner');

  INSERT INTO public.days (trip_id, date)
  SELECT v_trip_id, p_start_date + offset_days
  FROM generate_series(0, p_end_date - p_start_date) AS offset_days;

  RETURN v_trip_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_trip(text, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trip(text, date, date, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- purge_deleted_rows：永久刪除軟刪除超過 30 天的資料（docs/adr/0005、Q14）
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
$$;

REVOKE EXECUTE ON FUNCTION public.purge_deleted_rows() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 每天 03:00（台北時間）執行；cron.schedule 以名稱 upsert，重複執行不會多建一個排程。
SELECT cron.schedule('purge-deleted-rows', '0 19 * * *', 'select public.purge_deleted_rows()');
