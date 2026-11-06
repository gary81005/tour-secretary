-- M1 第 8 步：拖拉排序（Q17、Q22）。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- reorder_items：把一組沒有精確時間的項目設成同一個時段，並依陣列順序重新編 position。
-- 只更新「目標時段」：項目從原本的時段移走後，原時段剩下的 position 會有空號，
-- 但相對順序不變，不需要一起更新。
-- 有精確時間的項目依時間排序，不能拖（Q22），所以 start_time 不是 null 的項目不會被更新。
-- 有任何一筆對不上（已刪除、被加了時間、被搬到別天、重複的 id）就整筆取消，
-- 讓畫面重新讀取最新資料，而不是用舊的畫面覆蓋別人的修改。
-- security invoker：照常套用 RLS。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reorder_items(
  p_day_id uuid,
  p_time_slot public.time_slot,
  p_item_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.items i
  SET time_slot = p_time_slot,
      position = (ordered.ordinality - 1)::integer
  FROM unnest(p_item_ids) WITH ORDINALITY AS ordered (id, ordinality)
  WHERE i.id = ordered.id
    AND i.day_id = p_day_id
    AND i.deleted_at IS NULL
    AND i.start_time IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> coalesce(array_length(p_item_ids, 1), 0) THEN
    RAISE EXCEPTION 'items changed' USING ERRCODE = '40001';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_items(uuid, public.time_slot, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_items(uuid, public.time_slot, uuid[]) TO authenticated;
