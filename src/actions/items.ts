'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { getSignedInClient } from '@/lib/auth/session';
import { fieldErrorsOf, type ActionResult, type FormResult } from '@/lib/form';
import { parseItemFormData } from '@/lib/trip/item-form';
import { itemSchema } from '@/lib/trip/schemas';
import { TIME_SLOTS, type TimeSlot } from '@/lib/trip/time-slot';
import { rpcErrorKey } from '@/lib/rpc-errors';
import { isUuid } from '@/lib/uuid';

// 行程項目的 Server Actions。成功後 refresh() 讓單日畫面重新讀取。

// 新增（itemId 為 null）或更新一個項目，連同地點與備案（save_item RPC，同一個 transaction）。
export async function saveItem(itemId: string | null, formData: FormData): Promise<FormResult> {
  if (itemId !== null && !isUuid(itemId)) return { ok: false, error: 'notFound' };

  const parsed = itemSchema.safeParse(parseItemFormData(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const item = parsed.data;
  // 空值不傳，交給函式的 default null（產生的型別裡這些參數是選填）。
  const { error } = await supabase.rpc('save_item', {
    p_item_id: itemId ?? undefined,
    p_day_id: item.dayId,
    p_title: item.title,
    p_time_slot: item.timeSlot,
    p_category: item.category,
    p_start_time: item.startTime ?? undefined,
    p_end_time: item.endTime ?? undefined,
    p_description: item.description ?? undefined,
    p_url: item.url ?? undefined,
    p_places: item.places.map((place) => place.name),
    p_fallbacks: item.fallbacks,
  });
  // P0002：天或項目不存在、不是成員，或行程已進垃圾桶。
  if (error) return { ok: false, error: rpcErrorKey(error) };

  refresh();
  return { ok: true };
}

// 刪除是軟刪除，畫面上提供「復原」（Q13）。
export async function deleteItem(itemId: string): Promise<ActionResult> {
  return setItemDeletedAt(itemId, new Date().toISOString());
}

export async function restoreItem(itemId: string): Promise<ActionResult> {
  return setItemDeletedAt(itemId, null);
}

async function setItemDeletedAt(itemId: string, deletedAt: string | null): Promise<ActionResult> {
  if (!isUuid(itemId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data, error } = await supabase
    .from('items')
    .update({ deleted_at: deletedAt })
    .eq('id', itemId)
    .select('id');
  if (error) return { ok: false, error: 'unknown' };
  if (data.length === 0) return { ok: false, error: 'notFound' };

  refresh();
  return { ok: true };
}

const reorderSchema = z.object({
  dayId: z.uuid(),
  timeSlot: z.enum(TIME_SLOTS),
  itemIds: z.array(z.uuid()).max(100),
});

// 拖拉排序（Q22）：把 itemIds 依序設成 timeSlot 的手動順序。
// 不論成功與否都 refresh()：衝突時（資料已被別人或別的分頁改過）讓畫面拿到最新內容。
export async function reorderItems(
  dayId: string,
  timeSlot: TimeSlot,
  itemIds: string[],
): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ dayId, timeSlot, itemIds });
  if (!parsed.success) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('reorder_items', {
    p_day_id: parsed.data.dayId,
    p_time_slot: parsed.data.timeSlot,
    p_item_ids: parsed.data.itemIds,
  });
  refresh();
  if (error) return { ok: false, error: rpcErrorKey(error) };
  return { ok: true };
}
