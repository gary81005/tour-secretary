-- 地點座標的保存期限（ADR 0006 Q14；M3 review 後調整）
-- Google Maps Platform 服務條款：座標最多保存 30 天。
-- 1. 每天的清理排程把超過 30 天的座標清掉（地點 ID 保留，下次存檔時重新查）。
-- 2. 座標抓取時間不能晚於現在：瀏覽器可以直接寫這兩張表，填未來的時間會讓座標永遠不過期。

-- ---------------------------------------------------------------------------
-- clamp_location_fetched_at：抓取時間最晚是現在（交易開始時間）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clamp_location_fetched_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- 不用 least()：它會忽略 NULL，把清掉的座標變成「現在抓的」。
  IF new.location_fetched_at > now() THEN
    new.location_fetched_at = now();
  END IF;
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER clamp_location_fetched_at
  BEFORE INSERT OR UPDATE OF location_fetched_at ON public.item_places
  FOR EACH ROW EXECUTE FUNCTION public.clamp_location_fetched_at();

CREATE OR REPLACE TRIGGER clamp_location_fetched_at
  BEFORE INSERT OR UPDATE OF location_fetched_at ON public.stays
  FOR EACH ROW EXECUTE FUNCTION public.clamp_location_fetched_at();

-- 已經存在的未來時間一併改成現在。
UPDATE public.item_places SET location_fetched_at = now() WHERE location_fetched_at > now();
UPDATE public.stays SET location_fetched_at = now() WHERE location_fetched_at > now();

-- ---------------------------------------------------------------------------
-- purge_deleted_rows：加上清除超過 30 天的座標（每天 03:00 由 pg_cron 執行）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_deleted_rows()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.trips WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.items WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.stays WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.trip_notes WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.traveler_constraints WHERE deleted_at < now() - INTERVAL '30 days';
  DELETE FROM public.trip_imports WHERE created_at < now() - INTERVAL '30 days';
  UPDATE public.item_places
  SET lat = NULL, lng = NULL, location_fetched_at = NULL
  WHERE location_fetched_at < now() - INTERVAL '30 days';
  UPDATE public.stays
  SET lat = NULL, lng = NULL, location_fetched_at = NULL
  WHERE location_fetched_at < now() - INTERVAL '30 days';
$$;

REVOKE EXECUTE ON FUNCTION public.purge_deleted_rows() FROM PUBLIC, anon, authenticated;
