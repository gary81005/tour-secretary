-- M3 第 3 步：地點連結到地圖服務（docs/adr/0006 Q14）。
-- item_places 與 stays 加上地圖服務、地點 ID、座標、座標抓取時間；save_item 的 p_places 改成 jsonb。
-- 服務條款：地點 ID 可以永久保存；座標最多 30 天（過期由程式當作沒有，下次存檔時重新查）。
-- 營業時間、地址等其他內容不存資料庫。
-- 這個檔案可以重複執行。

DO $$ BEGIN
  CREATE TYPE public.map_provider AS ENUM ('google');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 欄位
-- ---------------------------------------------------------------------------

ALTER TABLE public.item_places
  ADD COLUMN IF NOT EXISTS provider public.map_provider,
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS location_fetched_at timestamptz;

ALTER TABLE public.stays
  ADD COLUMN IF NOT EXISTS provider public.map_provider,
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS location_fetched_at timestamptz;

-- 兩張表的規則相同：
-- - 地圖服務與地點 ID 一起有或一起沒有（沒有＝只有文字）
-- - 地點 ID 只有英數、底線、連字號（程式也用 isPlaceId() 檢查，會放進 URL 路徑）
-- - 座標、抓取時間一起有或一起沒有，且必須有地點 ID
ALTER TABLE public.item_places DROP CONSTRAINT IF EXISTS item_places_place_link;
ALTER TABLE public.item_places
  ADD CONSTRAINT item_places_place_link CHECK (
    (provider IS NULL) = (place_id IS NULL)
    AND (place_id IS NULL OR (place_id ~ '^[A-Za-z0-9_-]+$' AND char_length(place_id) <= 300))
    AND (lat IS NULL) = (lng IS NULL)
    AND (lat IS NULL) = (location_fetched_at IS NULL)
    AND (lat IS NULL OR (place_id IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180))
  );

ALTER TABLE public.stays DROP CONSTRAINT IF EXISTS stays_place_link;
ALTER TABLE public.stays
  ADD CONSTRAINT stays_place_link CHECK (
    (provider IS NULL) = (place_id IS NULL)
    AND (place_id IS NULL OR (place_id ~ '^[A-Za-z0-9_-]+$' AND char_length(place_id) <= 300))
    AND (lat IS NULL) = (lng IS NULL)
    AND (lat IS NULL) = (location_fetched_at IS NULL)
    AND (lat IS NULL OR (place_id IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180))
  );

-- ---------------------------------------------------------------------------
-- save_item：p_places 由 text[] 改成 jsonb。其餘與 20261106000001_save_item.sql 相同。
-- [{ "name": "淺草寺", "provider": "google" | null, "place_id": "ChIJ…" | null,
--    "lat": 35.71 | null, "lng": 139.79 | null, "location_fetched_at": "2026-11-11T…Z" | null }, ...]
-- 元素也可以是字串（只有名稱）：migration 套用後、新版程式部署前，舊版程式送的 text[] 仍然能存。
-- 座標由 Server Action 向地圖服務查（不相信瀏覽器傳來的座標）；地點沒變時沿用原本的座標與抓取時間。
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.save_item(
  uuid, text, public.time_slot, public.item_category, uuid, time, time, text, text, text[], jsonb
);

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
  p_places jsonb DEFAULT '[]',
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
  INSERT INTO public.item_places (
    trip_id, item_id, name, position, provider, place_id, lat, lng, location_fetched_at
  )
  SELECT v_trip_id, v_item_id,
         CASE WHEN jsonb_typeof(place.value) = 'string'
           THEN place.value #>> '{}'
           ELSE place.value ->> 'name'
         END,
         (place.ordinality - 1)::integer,
         -- 字串元素的 ->> 都是 null，也就是沒有連結。
         (place.value ->> 'provider')::public.map_provider,
         place.value ->> 'place_id',
         (place.value ->> 'lat')::double precision,
         (place.value ->> 'lng')::double precision,
         (place.value ->> 'location_fetched_at')::timestamptz
  FROM jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) WITH ORDINALITY AS place (value, ordinality);

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
  uuid, text, public.time_slot, public.item_category, uuid, time, time, text, text, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_item(
  uuid, text, public.time_slot, public.item_category, uuid, time, time, text, text, jsonb, jsonb
) TO authenticated;
