-- M1 行程函式：建立行程、每日清理垃圾桶。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- create_trip：建立行程、把自己加為 owner、依起訖日產生每一天
-- security definer：trips / trip_members / days 都沒有開放直接 insert。
-- ---------------------------------------------------------------------------

create or replace function public.create_trip(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_timezone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_trip_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.trips (name, start_date, end_date, default_timezone, created_by)
  values (btrim(p_name), p_start_date, p_end_date, p_timezone, v_user_id)
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, v_user_id, 'owner');

  insert into public.days (trip_id, date)
  select v_trip_id, p_start_date + offset_days
  from generate_series(0, p_end_date - p_start_date) as offset_days;

  return v_trip_id;
end;
$$;

revoke execute on function public.create_trip(text, date, date, text) from public, anon;
grant execute on function public.create_trip(text, date, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- purge_deleted_rows：永久刪除軟刪除超過 30 天的資料（docs/adr/0005、Q14）
-- ---------------------------------------------------------------------------

create or replace function public.purge_deleted_rows()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.trips where deleted_at < now() - interval '30 days';
  delete from public.items where deleted_at < now() - interval '30 days';
  delete from public.stays where deleted_at < now() - interval '30 days';
  delete from public.trip_notes where deleted_at < now() - interval '30 days';
  delete from public.traveler_constraints where deleted_at < now() - interval '30 days';
$$;

revoke execute on function public.purge_deleted_rows() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- 每天 03:00（台北時間）執行；cron.schedule 以名稱 upsert，重複執行不會多建一個排程。
select cron.schedule('purge-deleted-rows', '0 19 * * *', 'select public.purge_deleted_rows()');
