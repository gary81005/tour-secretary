-- M1 第 10 步：提醒事項拖拉排序（Q23）。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- reorder_trip_notes：依陣列順序重新編 position。陣列要是這趟行程「全部」未刪除的提醒事項；
-- 有任何一筆對不上（已刪除、別趟行程、重複、漏掉）就整筆取消（40001），讓畫面重新讀取。
-- security invoker：照常套用 RLS。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reorder_trip_notes(p_trip_id uuid, p_note_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
  v_total integer;
BEGIN
  UPDATE public.trip_notes n
  SET position = (ordered.ordinality - 1)::integer
  FROM unnest(p_note_ids) WITH ORDINALITY AS ordered (id, ordinality)
  WHERE n.id = ordered.id AND n.trip_id = p_trip_id AND n.deleted_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  SELECT count(*) INTO v_total
  FROM public.trip_notes
  WHERE trip_id = p_trip_id AND deleted_at IS NULL;

  IF v_updated <> coalesce(array_length(p_note_ids, 1), 0) OR v_updated <> v_total THEN
    RAISE EXCEPTION 'notes changed' USING ERRCODE = '40001';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reorder_trip_notes(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_trip_notes(uuid, uuid[]) TO authenticated;
