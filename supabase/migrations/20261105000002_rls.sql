-- M1 權限：一律以「是不是這趟行程的成員」判斷（docs/adr/0005）。
-- 軟刪除（deleted_at）不在 RLS 過濾：RLS 擋掉已刪除的列會讓「復原」無法 update 回來，
-- 所以由查詢端加 `deleted_at is null`。進垃圾桶的行程，底下的資料一律不可存取。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- Helper functions（security definer：在 policy 內查 trip_members 不會遞迴觸發 RLS）
-- ---------------------------------------------------------------------------

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- 成員，且行程不在垃圾桶裡：行程底下的資料都用這個判斷。
create or replace function public.can_access_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members m
    join public.trips t on t.id = m.trip_id
    where m.trip_id = p_trip_id
      and m.user_id = (select auth.uid())
      and t.deleted_at is null
  );
$$;

-- 自己，或和自己同一趟行程的旅伴。
create or replace function public.shares_trip_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members me
    join public.trip_members other on other.trip_id = me.trip_id
    where me.user_id = (select auth.uid())
      and other.user_id = p_user_id
  );
$$;

revoke execute on function public.is_trip_member(uuid) from public, anon;
revoke execute on function public.is_trip_owner(uuid) from public, anon;
revoke execute on function public.can_access_trip(uuid) from public, anon;
revoke execute on function public.shares_trip_with(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;
grant execute on function public.can_access_trip(uuid) to authenticated;
grant execute on function public.shares_trip_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.days enable row level security;
alter table public.items enable row level security;
alter table public.item_places enable row level security;
alter table public.fallbacks enable row level security;
alter table public.stays enable row level security;
alter table public.trip_notes enable row level security;
alter table public.traveler_constraints enable row level security;

-- ---------------------------------------------------------------------------
-- Grants：明確列出 authenticated 能做的事；anon 一律沒有權限。
-- 欄位層級的 update 讓「起訖日、天的日期」只能透過 RPC 改，天數才不會和日期範圍脫節。
-- ---------------------------------------------------------------------------

revoke all on
  public.profiles, public.trips, public.trip_members, public.days, public.items,
  public.item_places, public.fallbacks, public.stays, public.trip_notes,
  public.traveler_constraints
from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- 新增行程走 create_trip()；起訖日走之後的日期 RPC。
grant select, delete on public.trips to authenticated;
grant update (name, default_timezone, deleted_at) on public.trips to authenticated;

-- 成員異動在 M5（邀請流程）才開放。
grant select on public.trip_members to authenticated;

-- 天的新增、刪除、改日期都走 RPC。
grant select on public.days to authenticated;
grant update (city, timezone) on public.days to authenticated;

grant select, insert, update, delete on
  public.items, public.item_places, public.fallbacks, public.stays, public.trip_notes,
  public.traveler_constraints
to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

drop policy if exists "profiles: read self and travel companions" on public.profiles;
create policy "profiles: read self and travel companions"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_trip_with(id));

drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 成員看得到垃圾桶裡的行程（垃圾桶頁面要用）。
drop policy if exists "trips: members can read" on public.trips;
create policy "trips: members can read"
  on public.trips for select to authenticated
  using (public.is_trip_member(id));

drop policy if exists "trips: members can update" on public.trips;
create policy "trips: members can update"
  on public.trips for update to authenticated
  using (public.is_trip_member(id))
  with check (public.is_trip_member(id));

-- 永久刪除只有 owner 能做。
drop policy if exists "trips: owner can delete" on public.trips;
create policy "trips: owner can delete"
  on public.trips for delete to authenticated
  using (public.is_trip_owner(id));

drop policy if exists "trip_members: members can read" on public.trip_members;
create policy "trip_members: members can read"
  on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists "days: members can access" on public.days;
create policy "days: members can access"
  on public.days for all to authenticated
  using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

drop policy if exists "items: members can access" on public.items;
create policy "items: members can access"
  on public.items for all to authenticated
  using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

drop policy if exists "item_places: members can access" on public.item_places;
create policy "item_places: members can access"
  on public.item_places for all to authenticated
  using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

drop policy if exists "fallbacks: members can access" on public.fallbacks;
create policy "fallbacks: members can access"
  on public.fallbacks for all to authenticated
  using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

drop policy if exists "stays: members can access" on public.stays;
create policy "stays: members can access"
  on public.stays for all to authenticated
  using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

drop policy if exists "trip_notes: members can access" on public.trip_notes;
create policy "trip_notes: members can access"
  on public.trip_notes for all to authenticated
  using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));

drop policy if exists "traveler_constraints: members can access" on public.traveler_constraints;
create policy "traveler_constraints: members can access"
  on public.traveler_constraints for all to authenticated
  using (public.can_access_trip(trip_id))
  with check (public.can_access_trip(trip_id));
