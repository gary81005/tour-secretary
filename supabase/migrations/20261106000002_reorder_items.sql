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

create or replace function public.reorder_items(
  p_day_id uuid,
  p_time_slot public.time_slot,
  p_item_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.items i
  set time_slot = p_time_slot,
      position = (ordered.ordinality - 1)::integer
  from unnest(p_item_ids) with ordinality as ordered (id, ordinality)
  where i.id = ordered.id
    and i.day_id = p_day_id
    and i.deleted_at is null
    and i.start_time is null;

  get diagnostics v_updated = row_count;
  if v_updated <> coalesce(array_length(p_item_ids, 1), 0) then
    raise exception 'items changed' using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.reorder_items(uuid, public.time_slot, uuid[]) from public, anon;
grant execute on function public.reorder_items(uuid, public.time_slot, uuid[]) to authenticated;
