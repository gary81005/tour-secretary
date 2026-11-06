-- M1 權限：一律以「是不是這趟行程的成員」判斷（docs/adr/0005）。
-- 軟刪除（deleted_at）不在 RLS 過濾：RLS 擋掉已刪除的列會讓「復原」無法 update 回來，
-- 所以由查詢端加 `deleted_at is null`。進垃圾桶的行程，底下的資料一律不可存取。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- Helper functions（security definer：在 policy 內查 trip_members 不會遞迴觸發 RLS）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members m
    WHERE m.trip_id = p_trip_id
      AND m.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_trip_owner(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members m
    WHERE m.trip_id = p_trip_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'owner'
  );
$$;

-- 成員，且行程不在垃圾桶裡：行程底下的資料都用這個判斷。
CREATE OR REPLACE FUNCTION public.can_access_trip(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members m
    JOIN public.trips t ON t.id = m.trip_id
    WHERE m.trip_id = p_trip_id
      AND m.user_id = (SELECT auth.uid())
      AND t.deleted_at IS NULL
  );
$$;

-- 自己，或和自己同一趟行程的旅伴。
CREATE OR REPLACE FUNCTION public.shares_trip_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members me
    JOIN public.trip_members other ON other.trip_id = me.trip_id
    WHERE me.user_id = (SELECT auth.uid())
      AND other.user_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_trip_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_trip_owner(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_trip(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.shares_trip_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_trip_with(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fallbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traveler_constraints ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Grants：明確列出 authenticated 能做的事；anon 一律沒有權限。
-- 欄位層級的 update 讓「起訖日、天的日期」只能透過 RPC 改，天數才不會和日期範圍脫節。
-- ---------------------------------------------------------------------------

REVOKE ALL ON
  public.profiles, public.trips, public.trip_members, public.days, public.items,
  public.item_places, public.fallbacks, public.stays, public.trip_notes,
  public.traveler_constraints
FROM anon, authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;

-- 新增行程走 create_trip()；起訖日走之後的日期 RPC。
GRANT SELECT, DELETE ON public.trips TO authenticated;
GRANT UPDATE (name, default_timezone, deleted_at) ON public.trips TO authenticated;

-- 成員異動在 M5（邀請流程）才開放。
GRANT SELECT ON public.trip_members TO authenticated;

-- 天的新增、刪除、改日期都走 RPC。
GRANT SELECT ON public.days TO authenticated;
GRANT UPDATE (city, timezone) ON public.days TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.items, public.item_places, public.fallbacks, public.stays, public.trip_notes,
  public.traveler_constraints
TO authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles: read self and travel companions" ON public.profiles;
CREATE POLICY "profiles: read self and travel companions"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR public.shares_trip_with(id));

DROP POLICY IF EXISTS "profiles: update self" ON public.profiles;
CREATE POLICY "profiles: update self"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- 成員看得到垃圾桶裡的行程（垃圾桶頁面要用）。
DROP POLICY IF EXISTS "trips: members can read" ON public.trips;
CREATE POLICY "trips: members can read"
  ON public.trips FOR SELECT TO authenticated
  USING (public.is_trip_member(id));

DROP POLICY IF EXISTS "trips: members can update" ON public.trips;
CREATE POLICY "trips: members can update"
  ON public.trips FOR UPDATE TO authenticated
  USING (public.is_trip_member(id))
  WITH CHECK (public.is_trip_member(id));

-- 永久刪除只有 owner 能做。
DROP POLICY IF EXISTS "trips: owner can delete" ON public.trips;
CREATE POLICY "trips: owner can delete"
  ON public.trips FOR DELETE TO authenticated
  USING (public.is_trip_owner(id));

DROP POLICY IF EXISTS "trip_members: members can read" ON public.trip_members;
CREATE POLICY "trip_members: members can read"
  ON public.trip_members FOR SELECT TO authenticated
  USING (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS "days: members can access" ON public.days;
CREATE POLICY "days: members can access"
  ON public.days FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS "items: members can access" ON public.items;
CREATE POLICY "items: members can access"
  ON public.items FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS "item_places: members can access" ON public.item_places;
CREATE POLICY "item_places: members can access"
  ON public.item_places FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS "fallbacks: members can access" ON public.fallbacks;
CREATE POLICY "fallbacks: members can access"
  ON public.fallbacks FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS "stays: members can access" ON public.stays;
CREATE POLICY "stays: members can access"
  ON public.stays FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS "trip_notes: members can access" ON public.trip_notes;
CREATE POLICY "trip_notes: members can access"
  ON public.trip_notes FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));

DROP POLICY IF EXISTS "traveler_constraints: members can access" ON public.traveler_constraints;
CREATE POLICY "traveler_constraints: members can access"
  ON public.traveler_constraints FOR ALL TO authenticated
  USING (public.can_access_trip(trip_id))
  WITH CHECK (public.can_access_trip(trip_id));
