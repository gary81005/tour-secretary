-- M1 第 7 步：行程項目的儲存函式，以及連結欄位的 http(s) 限制。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- 連結只接受 http(s)：表單有 zod 驗證，但資料也可能經由 API 直接寫入。
-- 畫面上另有 isSafeHttpUrl() 再擋一次（src/lib/url.ts）。
-- ---------------------------------------------------------------------------

alter table public.items drop constraint if exists items_url_http;
alter table public.items
  add constraint items_url_http check (url is null or url ~* '^https?://');

alter table public.stays drop constraint if exists stays_url_http;
alter table public.stays
  add constraint stays_url_http check (url is null or url ~* '^https?://');

-- ---------------------------------------------------------------------------
-- save_item：新增或更新一個行程項目，並整批替換它的地點與備案。
-- security invoker：照常套用 RLS（只有行程成員能寫，進垃圾桶的行程不能寫）。
-- 一個函式呼叫就是一個 transaction，中途失敗時整筆都不會寫入。
-- ---------------------------------------------------------------------------

-- 可以是空值的參數都有 default：產生的 TypeScript 型別會是選填，呼叫端不傳就好。
-- PostgREST 以參數名稱呼叫，所以順序只影響 SQL 直接呼叫。
create or replace function public.save_item(
  p_day_id uuid,
  p_title text,
  p_time_slot public.time_slot,
  p_category public.item_category,
  -- null 表示新增
  p_item_id uuid default null,
  p_start_time time default null,
  p_end_time time default null,
  p_description text default null,
  p_url text default null,
  p_places text[] default '{}',
  -- [{ "condition": "纜車停駛" | null, "alternative": "改逛溫泉街" }, ...]
  p_fallbacks jsonb default '[]'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_item_id uuid := p_item_id;
  v_old_day_id uuid;
  v_old_slot public.time_slot;
  v_position integer;
begin
  -- 天由 RLS 過濾：不是成員或行程在垃圾桶裡時查不到。
  select d.trip_id into v_trip_id from public.days d where d.id = p_day_id;
  if v_trip_id is null then
    raise exception 'day not found' using errcode = 'P0002';
  end if;

  if v_item_id is not null then
    select i.day_id, i.time_slot into v_old_day_id, v_old_slot
    from public.items i
    where i.id = v_item_id and i.trip_id = v_trip_id and i.deleted_at is null;
    if v_old_day_id is null then
      raise exception 'item not found' using errcode = 'P0002';
    end if;
  end if;

  -- 新項目，或換了天／時段的項目，排到該時段手動順序的最後（Q22）。
  if v_item_id is null or v_old_day_id <> p_day_id or v_old_slot <> p_time_slot then
    select coalesce(max(i.position) + 1, 0) into v_position
    from public.items i
    where i.day_id = p_day_id and i.time_slot = p_time_slot and i.deleted_at is null
      and i.id is distinct from v_item_id;
  end if;

  if v_item_id is null then
    insert into public.items (
      trip_id, day_id, title, time_slot, category, start_time, end_time, description, url, position
    )
    values (
      v_trip_id, p_day_id, p_title, p_time_slot, p_category, p_start_time, p_end_time,
      p_description, p_url, v_position
    )
    returning id into v_item_id;
  else
    update public.items
    set day_id = p_day_id,
        title = p_title,
        time_slot = p_time_slot,
        category = p_category,
        start_time = p_start_time,
        end_time = p_end_time,
        description = p_description,
        url = p_url,
        position = coalesce(v_position, position)
    where id = v_item_id;
  end if;

  delete from public.item_places where item_id = v_item_id;
  insert into public.item_places (trip_id, item_id, name, position)
  select v_trip_id, v_item_id, place.name, (place.ordinality - 1)::integer
  from unnest(coalesce(p_places, '{}')) with ordinality as place (name, ordinality);

  delete from public.fallbacks where item_id = v_item_id;
  insert into public.fallbacks (trip_id, item_id, condition, alternative, position)
  select v_trip_id, v_item_id, fallback.condition, fallback.alternative,
         (fallback.ordinality - 1)::integer
  -- 有欄位定義的函式要包在 rows from (...) 裡才能加 with ordinality。
  from rows from (
         jsonb_to_recordset(coalesce(p_fallbacks, '[]'::jsonb)) as (condition text, alternative text)
       ) with ordinality as fallback (condition, alternative, ordinality);

  return v_item_id;
end;
$$;

revoke execute on function public.save_item(
  uuid, text, public.time_slot, public.item_category, uuid, time, time, text, text, text[], jsonb
) from public, anon;
grant execute on function public.save_item(
  uuid, text, public.time_slot, public.item_category, uuid, time, time, text, text, text[], jsonb
) to authenticated;
