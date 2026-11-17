-- M5 分支 review 的修正（ADR 0005「M5 旅伴與權限」）。
-- 1. 使用者不能自己改 profiles.avatar_url：M5 開始旅伴會看到彼此的頭像，任意網址會讓同行程的人
--    載入外部圖片（洩漏 IP 與使用時間）。頭像只由 handle_new_user 從登入方式（Google）帶入，畫面上也沒有改頭像的功能。
-- 2. 名稱不能只有空白、前後不能有空白：原本只檢查長度，直接呼叫 API 存空白名稱就能略過 join_trip 的
--    「沒有名稱要先填」。既有資料先整理（空白的改成 null），再加 check；handle_new_user、join_trip 截到 50 字後再去空白。
-- 3. reset_trip_invite、remove_trip_member 先鎖住行程，和 join_trip 排隊：重設當下正在加入的人不會用舊 token 加入。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- 1. 頭像
-- ---------------------------------------------------------------------------

REVOKE UPDATE (avatar_url) ON public.profiles FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. 名稱
-- ---------------------------------------------------------------------------

UPDATE public.profiles
SET display_name = nullif(btrim(display_name), '')
WHERE display_name IS DISTINCT FROM nullif(btrim(display_name), '');

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_display_name_trimmed;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_trimmed CHECK (
    display_name IS NULL OR (display_name <> '' AND display_name = btrim(display_name))
  );

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
    -- 截到 50 字後可能以空白結尾，再去一次空白（profiles_display_name_trimmed）。
    btrim(left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
      ),
      50
    )),
    CASE
      WHEN v_avatar_url ~* '^https?://' AND char_length(v_avatar_url) <= 2000 THEN v_avatar_url
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_trip(p_token uuid, p_display_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_trip_id uuid;
  v_name text := nullif(btrim(left(btrim(p_display_name), 50)), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 鎖住行程：同時加入的人排隊計算人數，也不會和重設連結、移除旅伴、移到垃圾桶交錯
  -- （reset_trip_invite、remove_trip_member 也先鎖同一列）。
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

-- ---------------------------------------------------------------------------
-- 3. 重設連結、移除旅伴先鎖住行程。其餘與 20261117000002 相同。
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
  -- 和 join_trip 鎖同一列：重設完成前開始的加入，要等重設 commit 後再用新的 token 判斷。
  PERFORM 1 FROM public.trips WHERE id = p_trip_id FOR UPDATE;

  INSERT INTO public.trip_invites (trip_id) VALUES (p_trip_id)
  ON CONFLICT (trip_id) DO UPDATE SET token = gen_random_uuid(), updated_at = now()
  RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;

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
  PERFORM 1 FROM public.trips WHERE id = p_trip_id FOR UPDATE;

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
