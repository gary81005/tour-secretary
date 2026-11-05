-- M1 第 9 步：修改行程日期與天數（Q15）。
-- trips.start_date/end_date、days.date 沒有開放直接改（20261105000002_rls.sql 的欄位層級 grant），
-- 一律透過這裡的函式，天數才不會和日期範圍脫節；住宿的日期也一起調整。
-- security definer：days 沒有開放 insert/delete，所以每個函式都先用 can_access_trip() 檢查權限。
-- 錯誤碼：P0002 找不到（或沒有權限）；22023 參數不合法（訊息是原因）；P0001 days_have_items。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- shift_trip：整趟平移 p_days 天（例如延後一週）。每天的內容跟著第 N 天移動。
-- ---------------------------------------------------------------------------

create or replace function public.shift_trip(p_trip_id uuid, p_days integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_trip(p_trip_id) then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  if p_days is null or p_days = 0 then
    return;
  end if;
  if abs(p_days) > 3650 then
    raise exception 'invalid_shift' using errcode = '22023';
  end if;

  update public.trips
  set start_date = start_date + p_days, end_date = end_date + p_days
  where id = p_trip_id;
  -- days_trip_date_key 是 deferrable，整批改日期時中途撞到同一天沒關係。
  update public.days set date = date + p_days where trip_id = p_trip_id;
  update public.stays
  set check_in = check_in + p_days, check_out = check_out + p_days
  where trip_id = p_trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_trip_dates：修改起訖日，以日期對應：保留還在新範圍內的天，補上缺少的日期。
-- 要刪掉的天只要還有項目（未刪除）就整筆擋下，detail 是那些日期（逗號分隔）。
-- ---------------------------------------------------------------------------

create or replace function public.set_trip_dates(
  p_trip_id uuid,
  p_start_date date,
  p_end_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocked text;
begin
  if not public.can_access_trip(p_trip_id) then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date - p_start_date >= 60 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  select string_agg(distinct d.date::text, ',' order by d.date::text) into v_blocked
  from public.days d
  join public.items i on i.day_id = d.id and i.deleted_at is null
  where d.trip_id = p_trip_id and (d.date < p_start_date or d.date > p_end_date);
  if v_blocked is not null then
    raise exception 'days_have_items' using errcode = 'P0001', detail = v_blocked;
  end if;

  delete from public.days
  where trip_id = p_trip_id and (date < p_start_date or date > p_end_date);

  insert into public.days (trip_id, date)
  select p_trip_id, p_start_date + offset_days
  from generate_series(0, p_end_date - p_start_date) as offset_days
  where not exists (
    select 1 from public.days d
    where d.trip_id = p_trip_id and d.date = p_start_date + offset_days
  );

  update public.trips set start_date = p_start_date, end_date = p_end_date where id = p_trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- insert_day_after：在某一天後面插入一天，之後的日期往後移一天、回程日延後一天。
-- 插入點之後的住宿一起往後移；跨過插入點的住宿多住一晚。
-- ---------------------------------------------------------------------------

create or replace function public.insert_day_after(p_day_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_date date;
  v_day_count integer;
  v_new_day_id uuid;
begin
  select d.trip_id, d.date into v_trip_id, v_date from public.days d where d.id = p_day_id;
  if v_trip_id is null or not public.can_access_trip(v_trip_id) then
    raise exception 'day not found' using errcode = 'P0002';
  end if;

  select count(*) into v_day_count from public.days where trip_id = v_trip_id;
  if v_day_count >= 60 then
    raise exception 'trip_too_long' using errcode = '22023';
  end if;

  update public.days set date = date + 1 where trip_id = v_trip_id and date > v_date;
  update public.stays
  set check_in = check_in + case when check_in > v_date then 1 else 0 end,
      check_out = check_out + 1
  where trip_id = v_trip_id and check_out > v_date;

  insert into public.days (trip_id, date) values (v_trip_id, v_date + 1)
  returning id into v_new_day_id;

  update public.trips set end_date = end_date + 1 where id = v_trip_id;
  return v_new_day_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_day：刪除一天（連同它的項目），之後的日期往前移一天、回程日提早一天。
-- 至少要留一天。只住被刪那一晚的住宿改成軟刪除（往前移會變成入住日 = 退房日）。
-- ---------------------------------------------------------------------------

create or replace function public.delete_day(p_day_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_date date;
  v_day_count integer;
begin
  select d.trip_id, d.date into v_trip_id, v_date from public.days d where d.id = p_day_id;
  if v_trip_id is null or not public.can_access_trip(v_trip_id) then
    raise exception 'day not found' using errcode = 'P0002';
  end if;

  select count(*) into v_day_count from public.days where trip_id = v_trip_id;
  if v_day_count <= 1 then
    raise exception 'last_day' using errcode = '22023';
  end if;

  delete from public.days where id = p_day_id;

  update public.stays set deleted_at = coalesce(deleted_at, now())
  where trip_id = v_trip_id and check_in = v_date and check_out = v_date + 1;

  update public.stays
  set check_in = check_in - case when check_in > v_date then 1 else 0 end,
      check_out = check_out - 1
  where trip_id = v_trip_id
    and check_out > v_date
    and not (check_in = v_date and check_out = v_date + 1);

  update public.days set date = date - 1 where trip_id = v_trip_id and date > v_date;
  update public.trips set end_date = end_date - 1 where id = v_trip_id;
end;
$$;

revoke execute on function public.shift_trip(uuid, integer) from public, anon;
revoke execute on function public.set_trip_dates(uuid, date, date) from public, anon;
revoke execute on function public.insert_day_after(uuid) from public, anon;
revoke execute on function public.delete_day(uuid) from public, anon;
grant execute on function public.shift_trip(uuid, integer) to authenticated;
grant execute on function public.set_trip_dates(uuid, date, date) to authenticated;
grant execute on function public.insert_day_after(uuid) to authenticated;
grant execute on function public.delete_day(uuid) to authenticated;
