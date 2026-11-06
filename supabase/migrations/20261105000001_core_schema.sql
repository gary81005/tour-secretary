-- M1 核心資料表：行程 → 天 → 項目，加上住宿、提醒事項、旅伴限制。
-- 名詞定義見 CONTEXT.md，決策見 docs/adr/0004、0005。
-- 這個檔案可以重複執行（if not exists / create or replace）。

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- 順序有意義：排序時「整天」排最前，其餘照一天的時間先後。
DO $$ BEGIN
  CREATE TYPE public.time_slot AS ENUM (
    'all_day', 'early_morning', 'morning', 'noon', 'afternoon', 'evening', 'night'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.item_category AS ENUM (
    'sightseeing', 'meal', 'transport', 'lodging', 'shopping', 'reminder'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stay_status AS ENUM ('candidate', 'booked', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.traveler_constraint_kind AS ENUM (
    'diet', 'stamina', 'mobility', 'preference', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.trip_role AS ENUM ('owner', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 共用 trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- 時區欄位用 IANA 名稱；無效的名稱在 `at time zone` 會直接拋錯。
CREATE OR REPLACE FUNCTION public.validate_timezone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_timezone text := to_jsonb(new) ->> tg_argv[0];
BEGIN
  IF v_timezone IS NOT NULL THEN
    PERFORM now() AT TIME ZONE v_timezone;
  END IF;
  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles：使用者顯示名稱與頭像（M5 顯示旅伴用）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text CHECK (char_length(display_name) <= 50),
  avatar_url text CHECK (char_length(avatar_url) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 新使用者自動建立 profile：Google 帶入名稱與頭像，Email 使用 email 前綴。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
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
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 補上 migration 之前就已經註冊的使用者。
INSERT INTO public.profiles (id, display_name, avatar_url)
SELECT
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
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- trips / trip_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  start_date date NOT NULL,
  end_date date NOT NULL,
  default_timezone text NOT NULL DEFAULT 'Asia/Tokyo',
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 進垃圾桶的時間；30 天後由 purge_deleted_rows() 永久刪除。
  deleted_at timestamptz,
  CONSTRAINT trips_date_range CHECK (end_date >= start_date AND end_date - start_date < 60)
);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER validate_timezone
  BEFORE INSERT OR UPDATE OF default_timezone ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.validate_timezone('default_timezone');

CREATE TABLE IF NOT EXISTS public.trip_members (
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.trip_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS trip_members_user_id_idx ON public.trip_members (user_id);

-- ---------------------------------------------------------------------------
-- days：由行程起訖日產生，一天一筆
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  date date NOT NULL,
  city text CHECK (char_length(city) <= 50),
  -- null 表示沿用 trips.default_timezone。
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- deferrable：整趟平移時所有日期一起改，中途會暫時撞到同一天。
  CONSTRAINT days_trip_date_key UNIQUE (trip_id, date) DEFERRABLE INITIALLY DEFERRED,
  -- 給 items 的複合外鍵用，確保項目和它的天屬於同一趟行程。
  CONSTRAINT days_id_trip_key UNIQUE (id, trip_id)
);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER validate_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.days
  FOR EACH ROW EXECUTE FUNCTION public.validate_timezone('timezone');

-- ---------------------------------------------------------------------------
-- items / item_places / fallbacks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  day_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  time_slot public.time_slot NOT NULL,
  category public.item_category NOT NULL,
  start_time time,
  end_time time,
  description text CHECK (char_length(description) <= 5000),
  url text CHECK (char_length(url) <= 2000),
  -- 同一時段內、沒有精確時間的項目的手動順序。
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT items_day_fk FOREIGN KEY (day_id, trip_id)
    REFERENCES public.days (id, trip_id) ON DELETE CASCADE,
  -- 不支援跨午夜：有結束時間就必須有開始時間，且晚於開始時間。
  CONSTRAINT items_time_range CHECK (
    end_time IS NULL OR (start_time IS NOT NULL AND end_time > start_time)
  ),
  CONSTRAINT items_id_trip_key UNIQUE (id, trip_id)
);

CREATE INDEX IF NOT EXISTS items_day_id_idx ON public.items (day_id);
CREATE INDEX IF NOT EXISTS items_trip_id_idx ON public.items (trip_id);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 地點與備案是項目表單的一部分，存檔時整批替換，不做軟刪除。
CREATE TABLE IF NOT EXISTS public.item_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_places_item_fk FOREIGN KEY (item_id, trip_id)
    REFERENCES public.items (id, trip_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS item_places_item_id_idx ON public.item_places (item_id);

CREATE TABLE IF NOT EXISTS public.fallbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  -- 觸發條件可以留空，例如只寫了替代方案。
  condition text CHECK (char_length(condition) <= 500),
  alternative text NOT NULL CHECK (char_length(btrim(alternative)) BETWEEN 1 AND 1000),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fallbacks_item_fk FOREIGN KEY (item_id, trip_id)
    REFERENCES public.items (id, trip_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS fallbacks_item_id_idx ON public.fallbacks (item_id);

-- ---------------------------------------------------------------------------
-- stays / trip_notes / traveler_constraints
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  check_in date NOT NULL,
  check_out date NOT NULL,
  address text CHECK (char_length(address) <= 500),
  status public.stay_status NOT NULL DEFAULT 'candidate',
  confirmation_code text CHECK (char_length(confirmation_code) <= 100),
  url text CHECK (char_length(url) <= 2000),
  note text CHECK (char_length(note) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT stays_date_range CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS stays_trip_id_idx ON public.stays (trip_id);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.stays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.trip_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  topic text NOT NULL CHECK (char_length(btrim(topic)) BETWEEN 1 AND 100),
  content text CHECK (char_length(content) <= 5000),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS trip_notes_trip_id_idx ON public.trip_notes (trip_id);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.trip_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.traveler_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  kind public.traveler_constraint_kind NOT NULL,
  -- 選填的對象，例如「媽媽」。
  subject text CHECK (char_length(subject) <= 50),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS traveler_constraints_trip_id_idx
  ON public.traveler_constraints (trip_id);

CREATE OR REPLACE TRIGGER set_updated_at
  BEFORE UPDATE ON public.traveler_constraints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
