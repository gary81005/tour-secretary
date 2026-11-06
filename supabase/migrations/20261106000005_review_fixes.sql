-- M1 開 PR 前 review 的修正。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- 1. profiles.avatar_url 只接受 http(s)，和 items.url / stays.url 一致。
--    同一趟行程的旅伴會載入彼此的頭像（shares_trip_with），不該是任意網址。
--    handle_new_user 只收合法的網址並截斷，避免 user metadata 太長或格式不對時 trigger 拋錯、註冊失敗。
-- ---------------------------------------------------------------------------

UPDATE public.profiles
SET avatar_url = NULL
WHERE avatar_url IS NOT NULL AND avatar_url !~* '^https?://';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_url_http;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_http CHECK (avatar_url IS NULL OR avatar_url ~* '^https?://');

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
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        split_part(new.email, '@', 1)
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

-- ---------------------------------------------------------------------------
-- 2. 整趟平移改成傳「新的出發日」，平移天數在函式內用當下的出發日計算。
--    原本由 Server Action 先讀出發日再算天數，中間若有人改了起訖日，會平移到錯的日期。
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.shift_trip(uuid, integer);

CREATE OR REPLACE FUNCTION public.shift_trip(p_trip_id uuid, p_start_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days integer;
BEGIN
  IF NOT public.can_access_trip(p_trip_id) THEN
    RAISE EXCEPTION 'trip not found' USING ERRCODE = 'P0002';
  END IF;

  -- for update：鎖住這趟行程，同時進來的日期異動排隊執行。
  SELECT p_start_date - t.start_date INTO v_days
  FROM public.trips t
  WHERE t.id = p_trip_id
  FOR UPDATE;

  IF v_days IS NULL OR v_days = 0 THEN
    RETURN;
  END IF;

  UPDATE public.trips
  SET start_date = start_date + v_days, end_date = end_date + v_days
  WHERE id = p_trip_id;
  -- days_trip_date_key 是 deferrable，整批改日期時中途撞到同一天沒關係。
  UPDATE public.days SET date = date + v_days WHERE trip_id = p_trip_id;
  UPDATE public.stays
  SET check_in = check_in + v_days, check_out = check_out + v_days
  WHERE trip_id = p_trip_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shift_trip(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_trip(uuid, date) TO authenticated;
