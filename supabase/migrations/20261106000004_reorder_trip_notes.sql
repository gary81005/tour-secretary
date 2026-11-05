-- M1 第 10 步：提醒事項拖拉排序（Q23）。
-- 這個檔案可以重複執行。

-- ---------------------------------------------------------------------------
-- reorder_trip_notes：依陣列順序重新編 position。陣列要是這趟行程「全部」未刪除的提醒事項；
-- 有任何一筆對不上（已刪除、別趟行程、重複、漏掉）就整筆取消（40001），讓畫面重新讀取。
-- security invoker：照常套用 RLS。
-- ---------------------------------------------------------------------------

create or replace function public.reorder_trip_notes(p_trip_id uuid, p_note_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
  v_total integer;
begin
  update public.trip_notes n
  set position = (ordered.ordinality - 1)::integer
  from unnest(p_note_ids) with ordinality as ordered (id, ordinality)
  where n.id = ordered.id and n.trip_id = p_trip_id and n.deleted_at is null;

  get diagnostics v_updated = row_count;
  select count(*) into v_total
  from public.trip_notes
  where trip_id = p_trip_id and deleted_at is null;

  if v_updated <> coalesce(array_length(p_note_ids, 1), 0) or v_updated <> v_total then
    raise exception 'notes changed' using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.reorder_trip_notes(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_trip_notes(uuid, uuid[]) to authenticated;
