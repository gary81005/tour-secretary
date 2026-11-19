-- M5 第 4 步：邀請連結、加入、退出、移除旅伴（ADR 0005「M5 旅伴與權限」Q7、Q8、Q13、Q14）。
-- - 一個行程一個邀請連結（/invite/<token>），可以重複使用、不設期限；主辦人重設後舊連結失效。
-- - 旅伴上限 20 人（含主辦人）。
-- - 沒登入時不能查任何東西（anon 沒有權限）；登入後用 get_trip_invite 顯示確認頁，按「加入」呼叫 join_trip。
-- - 旅伴可以退出；主辦人不能退出，可以移除旅伴（預設同時重設連結）。
-- - 名稱：註冊時不再用 Email 前半段當名稱（旅伴之間不顯示 Email）；沒有名稱的人加入時要先填。
-- 錯誤碼：P0002 連結無效或找不到；P0001 trip_full / owner_cannot_leave；22023 name_required；
-- 42501 not authenticated / owner_only。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- trip_invites：每個行程一筆。token 是隨機 uuid（122 bits），只有主辦人讀得到。
-- 新行程由 trigger 建立；寫入只透過 reset_trip_invite / remove_trip_member。
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_invites (
  trip_id uuid PRIMARY KEY REFERENCES public.trips (id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.trip_invites FROM anon, authenticated;
GRANT SELECT ON public.trip_invites TO authenticated;

DROP POLICY IF EXISTS "trip_invites: owner can read" ON public.trip_invites;
CREATE POLICY "trip_invites: owner can read"
  ON public.trip_invites FOR SELECT TO authenticated
  USING (public.is_trip_owner(trip_id));

CREATE OR REPLACE FUNCTION public.create_trip_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.trip_invites (trip_id) VALUES (new.id) ON CONFLICT (trip_id) DO NOTHING;
  RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_trip_invite() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER create_trip_invite
  AFTER INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.create_trip_invite();

-- 既有的行程補上邀請連結。
INSERT INTO public.trip_invites (trip_id)
SELECT id FROM public.trips
ON CONFLICT (trip_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 名稱：只用 Google 等登入方式給的名字，沒有就是 null（畫面顯示「旅伴」，加入行程時要先填）。
-- 原本沒有名字時用 Email 前半段，會讓旅伴看到 Email 的一部分；這樣產生的名稱一併清掉。
-- 頭像的規則與 20261106000005 相同。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_avatar_url text := new.raw_user_meta_data ->> 'avatar_url';
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
      ),
      50
    ),
    CASE
      WHEN v_avatar_url ~* '^https?://' AND char_length(v_avatar_url) <= 2000 THEN v_avatar_url
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

UPDATE public.profiles p
SET display_name = NULL
FROM auth.users u
WHERE u.id = p.id
  AND p.display_name = left(split_part(u.email, '@', 1), 50)
  AND nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '') IS NULL
  AND nullif(btrim(u.raw_user_meta_data ->> 'name'), '') IS NULL;

-- ---------------------------------------------------------------------------
-- reset_trip_invite：主辦人重設邀請連結，舊連結立刻失效。回傳新的 token。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reset_trip_invite(p_trip_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token uuid;
BEGIN
  PERFORM public.ensure_trip_owner(p_trip_id);

  INSERT INTO public.trip_invites (trip_id) VALUES (p_trip_id)
  ON CONFLICT (trip_id) DO UPDATE SET token = gen_random_uuid(), updated_at = now()
  RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_trip_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_trip_invite(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_trip_invite：邀請頁（登入後）要顯示的內容。連結無效時沒有任何列。
-- status：
-- - joinable：可以加入，顯示確認頁
-- - member：已經是旅伴，直接進行程
-- - full：人數已滿
-- - trashed：行程在垃圾桶（其他欄位是 null，不透露行程內容）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_trip_invite(p_token uuid)
RETURNS TABLE (
  trip_id uuid,
  status text,
  name text,
  start_date date,
  end_date date,
  owner_name text,
  owner_avatar_url text,
  member_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_trip public.trips%ROWTYPE;
  v_member_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT t.* INTO v_trip
  FROM public.trip_invites i JOIN public.trips t ON t.id = i.trip_id
  WHERE i.token = p_token;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_trip.deleted_at IS NOT NULL THEN
    RETURN QUERY SELECT v_trip.id, 'trashed'::text, NULL::text, NULL::date, NULL::date,
      NULL::text, NULL::text, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_member_count FROM public.trip_members m WHERE m.trip_id = v_trip.id;

  RETURN QUERY
  SELECT v_trip.id,
         CASE
           WHEN public.is_trip_member(v_trip.id) THEN 'member'
           WHEN v_member_count >= 20 THEN 'full'
           ELSE 'joinable'
         END,
         v_trip.name, v_trip.start_date, v_trip.end_date,
         p.display_name, p.avatar_url, v_member_count
  FROM public.trip_members m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.trip_id = v_trip.id AND m.role = 'owner';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_trip_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_invite(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- join_trip：用邀請連結加入，回傳行程 id。已經是旅伴時直接回傳（不重複加入）。
-- p_display_name：確認頁填的名稱（還沒有名稱時必填，已經有名稱時不傳）。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.join_trip(p_token uuid, p_display_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_trip_id uuid;
  v_name text := left(nullif(btrim(p_display_name), ''), 50);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 鎖住行程：同時加入的人排隊計算人數，也不會和重設連結、移到垃圾桶交錯。
  SELECT t.id INTO v_trip_id
  FROM public.trip_invites i JOIN public.trips t ON t.id = i.trip_id
  WHERE i.token = p_token AND t.deleted_at IS NULL
  FOR UPDATE OF t;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_name IS NOT NULL THEN
    UPDATE public.profiles SET display_name = v_name WHERE id = v_user_id;
  END IF;

  IF public.is_trip_member(v_trip_id) THEN
    RETURN v_trip_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id AND p.display_name IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = v_trip_id) >= 20 THEN
    RAISE EXCEPTION 'trip_full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.trip_members (trip_id, user_id, role) VALUES (v_trip_id, v_user_id, 'member');
  RETURN v_trip_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_trip(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_trip(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- leave_trip：旅伴退出。主辦人不能退出（還不能轉移，要結束就移到垃圾桶）。
-- 他新增的資料、打過的「完成」都留在行程裡。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.is_trip_owner(p_trip_id) THEN
    RAISE EXCEPTION 'owner_cannot_leave' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.trip_members WHERE trip_id = p_trip_id AND user_id = (SELECT auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_trip(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_trip(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- remove_trip_member：主辦人移除旅伴。p_reset_invite（預設 true）同時重設邀請連結，
-- 不然被移除的人可以用舊連結再加回來（ADR 0005 Q14）。只能移除旅伴，不能移除主辦人。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_trip_member(
  p_trip_id uuid,
  p_user_id uuid,
  p_reset_invite boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.ensure_trip_owner(p_trip_id);

  DELETE FROM public.trip_members
  WHERE trip_id = p_trip_id AND user_id = p_user_id AND role = 'member';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_reset_invite THEN
    PERFORM public.reset_trip_invite(p_trip_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_trip_member(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_trip_member(uuid, uuid, boolean) TO authenticated;
