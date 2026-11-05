-- M1 核心資料表：行程 → 天 → 項目，加上住宿、提醒事項、旅伴限制。
-- 名詞定義見 CONTEXT.md，決策見 docs/adr/0004、0005。
-- 這個檔案可以重複執行（if not exists / create or replace）。

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- 順序有意義：排序時「整天」排最前，其餘照一天的時間先後。
do $$ begin
  create type public.time_slot as enum (
    'all_day', 'early_morning', 'morning', 'noon', 'afternoon', 'evening', 'night'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.item_category as enum (
    'sightseeing', 'meal', 'transport', 'lodging', 'shopping', 'reminder'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stay_status as enum ('candidate', 'booked', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.traveler_constraint_kind as enum (
    'diet', 'stamina', 'mobility', 'preference', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.trip_role as enum ('owner', 'member');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 共用 trigger function
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 時區欄位用 IANA 名稱；無效的名稱在 `at time zone` 會直接拋錯。
create or replace function public.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_timezone text := to_jsonb(new) ->> tg_argv[0];
begin
  if v_timezone is not null then
    perform now() at time zone v_timezone;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles：使用者顯示名稱與頭像（M5 顯示旅伴用）
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 50),
  avatar_url text check (char_length(avatar_url) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 新使用者自動建立 profile：Google 帶入名稱與頭像，Email 使用 email 前綴。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        split_part(new.email, '@', 1)
      ),
      50
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 補上 migration 之前就已經註冊的使用者。
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      split_part(u.email, '@', 1)
    ),
    50
  ),
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- trips / trip_members
-- ---------------------------------------------------------------------------

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  start_date date not null,
  end_date date not null,
  default_timezone text not null default 'Asia/Tokyo',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 進垃圾桶的時間；30 天後由 purge_deleted_rows() 永久刪除。
  deleted_at timestamptz,
  constraint trips_date_range check (end_date >= start_date and end_date - start_date < 60)
);

create or replace trigger set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

create or replace trigger validate_timezone
  before insert or update of default_timezone on public.trips
  for each row execute function public.validate_timezone('default_timezone');

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.trip_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

-- ---------------------------------------------------------------------------
-- days：由行程起訖日產生，一天一筆
-- ---------------------------------------------------------------------------

create table if not exists public.days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  date date not null,
  city text check (char_length(city) <= 50),
  -- null 表示沿用 trips.default_timezone。
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- deferrable：整趟平移時所有日期一起改，中途會暫時撞到同一天。
  constraint days_trip_date_key unique (trip_id, date) deferrable initially deferred,
  -- 給 items 的複合外鍵用，確保項目和它的天屬於同一趟行程。
  constraint days_id_trip_key unique (id, trip_id)
);

create or replace trigger set_updated_at
  before update on public.days
  for each row execute function public.set_updated_at();

create or replace trigger validate_timezone
  before insert or update of timezone on public.days
  for each row execute function public.validate_timezone('timezone');

-- ---------------------------------------------------------------------------
-- items / item_places / fallbacks
-- ---------------------------------------------------------------------------

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  time_slot public.time_slot not null,
  category public.item_category not null,
  start_time time,
  end_time time,
  description text check (char_length(description) <= 5000),
  url text check (char_length(url) <= 2000),
  -- 同一時段內、沒有精確時間的項目的手動順序。
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint items_day_fk foreign key (day_id, trip_id)
    references public.days (id, trip_id) on delete cascade,
  -- 不支援跨午夜：有結束時間就必須有開始時間，且晚於開始時間。
  constraint items_time_range check (
    end_time is null or (start_time is not null and end_time > start_time)
  ),
  constraint items_id_trip_key unique (id, trip_id)
);

create index if not exists items_day_id_idx on public.items (day_id);
create index if not exists items_trip_id_idx on public.items (trip_id);

create or replace trigger set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- 地點與備案是項目表單的一部分，存檔時整批替換，不做軟刪除。
create table if not exists public.item_places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  item_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint item_places_item_fk foreign key (item_id, trip_id)
    references public.items (id, trip_id) on delete cascade
);

create index if not exists item_places_item_id_idx on public.item_places (item_id);

create table if not exists public.fallbacks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  item_id uuid not null,
  -- 觸發條件可以留空，例如只寫了替代方案。
  condition text check (char_length(condition) <= 500),
  alternative text not null check (char_length(btrim(alternative)) between 1 and 1000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint fallbacks_item_fk foreign key (item_id, trip_id)
    references public.items (id, trip_id) on delete cascade
);

create index if not exists fallbacks_item_id_idx on public.fallbacks (item_id);

-- ---------------------------------------------------------------------------
-- stays / trip_notes / traveler_constraints
-- ---------------------------------------------------------------------------

create table if not exists public.stays (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  check_in date not null,
  check_out date not null,
  address text check (char_length(address) <= 500),
  status public.stay_status not null default 'candidate',
  confirmation_code text check (char_length(confirmation_code) <= 100),
  url text check (char_length(url) <= 2000),
  note text check (char_length(note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint stays_date_range check (check_out > check_in)
);

create index if not exists stays_trip_id_idx on public.stays (trip_id);

create or replace trigger set_updated_at
  before update on public.stays
  for each row execute function public.set_updated_at();

create table if not exists public.trip_notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 100),
  content text check (char_length(content) <= 5000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists trip_notes_trip_id_idx on public.trip_notes (trip_id);

create or replace trigger set_updated_at
  before update on public.trip_notes
  for each row execute function public.set_updated_at();

create table if not exists public.traveler_constraints (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind public.traveler_constraint_kind not null,
  -- 選填的對象，例如「媽媽」。
  subject text check (char_length(subject) <= 50),
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists traveler_constraints_trip_id_idx
  on public.traveler_constraints (trip_id);

create or replace trigger set_updated_at
  before update on public.traveler_constraints
  for each row execute function public.set_updated_at();
