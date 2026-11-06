-- M1 第 7 步：行程項目的儲存函式，以及連結欄位的 http(s) 限制。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- 連結只接受 http(s)：表單有 zod 驗證，但資料也可能經由 API 直接寫入。
-- 畫面上另有 isSafeHttpUrl() 再擋一次（src/lib/url.ts）。
-- ---------------------------------------------------------------------------

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_url_http;
ALTER TABLE public.items
  ADD CONSTRAINT items_url_http CHECK (url IS NULL OR url ~* '^https?://');

ALTER TABLE public.stays DROP CONSTRAINT IF EXISTS stays_url_http;
ALTER TABLE public.stays
  ADD CONSTRAINT stays_url_http CHECK (url IS NULL OR url ~* '^https?://');

-- ---------------------------------------------------------------------------
-- save_item：新增或更新一個行程項目，並整批替換它的地點與備案。
-- security invoker：照常套用 RLS（只有行程成員能寫，進垃圾桶的行程不能寫）。
-- 一個函式呼叫就是一個 transaction，中途失敗時整筆都不會寫入。
-- ---------------------------------------------------------------------------

-- 可以是空值的參數都有 default：產生的 TypeScript 型別會是選填，呼叫端不傳就好。
-- PostgREST 以參數名稱呼叫，所以順序只影響 SQL 直接呼叫。
CREATE OR REPLACE FUNCTION public.save_item(
  p_day_id uuid,
  p_title text,
  p_time_slot public.time_slot,
  p_category public.item_category,
  -- null 表示新增
  p_item_id uuid DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_end_time time DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_places text[] DEFAULT '{}',
  -- [{ "condition": "纜車停駛" | null, "alternative": "改逛溫泉街" }, ...]
  p_fallbacks jsonb DEFAULT '[]'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_trip_id uuid;
  v_item_id uuid := p_item_id;
  v_old_day_id uuid;
  v_old_slot public.time_slot;
  v_position integer;
BEGIN
  -- 天由 RLS 過濾：不是成員或行程在垃圾桶裡時查不到。
  SELECT d.trip_id INTO v_trip_id FROM public.days d WHERE d.id = p_day_id;
  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'day not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_item_id IS NOT NULL THEN
    SELECT i.day_id, i.time_slot INTO v_old_day_id, v_old_slot
    FROM public.items i
    WHERE i.id = v_item_id AND i.trip_id = v_trip_id AND i.deleted_at IS NULL;
    IF v_old_day_id IS NULL THEN
      RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 新項目，或換了天／時段的項目，排到該時段手動順序的最後（Q22）。
  IF v_item_id IS NULL OR v_old_day_id <> p_day_id OR v_old_slot <> p_time_slot THEN
    SELECT coalesce(max(i.position) + 1, 0) INTO v_position
    FROM public.items i
    WHERE i.day_id = p_day_id AND i.time_slot = p_time_slot AND i.deleted_at IS NULL
      AND i.id IS DISTINCT FROM v_item_id;
  END IF;

  IF v_item_id IS NULL THEN
    INSERT INTO public.items (
      trip_id, day_id, title, time_slot, category, start_time, end_time, description, url, position
    )
    VALUES (
      v_trip_id, p_day_id, p_title, p_time_slot, p_category, p_start_time, p_end_time,
      p_description, p_url, v_position
    )
    RETURNING id INTO v_item_id;
  ELSE
    UPDATE public.items
    SET day_id = p_day_id,
        title = p_title,
        time_slot = p_time_slot,
        category = p_category,
        start_time = p_start_time,
        end_time = p_end_time,
        description = p_description,
        url = p_url,
        position = coalesce(v_position, position)
    WHERE id = v_item_id;
  END IF;

  DELETE FROM public.item_places WHERE item_id = v_item_id;
  INSERT INTO public.item_places (trip_id, item_id, name, position)
  SELECT v_trip_id, v_item_id, place.name, (place.ordinality - 1)::integer
  FROM unnest(coalesce(p_places, '{}')) WITH ORDINALITY AS place (name, ordinality);

  DELETE FROM public.fallbacks WHERE item_id = v_item_id;
  INSERT INTO public.fallbacks (trip_id, item_id, condition, alternative, position)
  SELECT v_trip_id, v_item_id, fallback.condition, fallback.alternative,
         (fallback.ordinality - 1)::integer
  -- 有欄位定義的函式要包在 rows from (...) 裡才能加 with ordinality。
  FROM ROWS FROM (
         jsonb_to_recordset(coalesce(p_fallbacks, '[]'::jsonb)) AS (condition text, alternative text)
       ) WITH ORDINALITY AS fallback (condition, alternative, ordinality);

  RETURN v_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_item(
  uuid, text, public.time_slot, public.item_category, uuid, time, time, text, text, text[], jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_item(
  uuid, text, public.time_slot, public.item_category, uuid, time, time, text, text, text[], jsonb
) TO authenticated;
