'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { getSignedInClient } from '@/lib/auth/session';
import { fieldErrorsOf, type ActionResult, type FormResult } from '@/lib/form';
import { locatePlaces, type PlaceToLocate } from '@/lib/maps/locate';
import { reusableLocations, toSavedPlaces, type SavedPlace } from '@/lib/maps/place-links';
import { parseItemFormData } from '@/lib/trip/item-form';
import { itemSchema } from '@/lib/trip/schemas';
import { TIME_SLOTS, type TimeSlot } from '@/lib/trip/time-slot';
import { rpcErrorKey } from '@/lib/rpc-errors';
import { setDeletedAt } from '@/lib/supabase/soft-delete';
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
  const places = await resolvePlaces(supabase, item.dayId, itemId, item.places);
  if (!places) return { ok: false, error: 'notFound' };
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
    p_places: places,
    p_fallbacks: item.fallbacks,
  });
  // P0002：天或項目不存在、不是成員，或行程已進垃圾桶。
  if (error) return { ok: false, error: rpcErrorKey(error) };

  refresh();
  return { ok: true };
}

type SignedInClient = NonNullable<Awaited<ReturnType<typeof getSignedInClient>>>;

// 連結的地點補上座標：沿用這個項目原本 30 天內的座標，其餘向地圖服務查（locatePlaces）。
// 先確認是那一天的行程成員（RLS 只回傳成員看得到的天），再向 Google 查座標，
// 避免非成員送假的地點 ID 消耗地圖服務的額度。不是成員時回傳 null。
async function resolvePlaces(
  supabase: SignedInClient,
  dayId: string,
  itemId: string | null,
  places: PlaceToLocate[],
): Promise<SavedPlace[] | null> {
  if (places.every((place) => !place.placeId)) return toSavedPlaces(places, new Map());

  const { data: day } = await supabase.from('days').select('id').eq('id', dayId).maybeSingle();
  if (!day) return null;

  const { data: existing } = itemId
    ? await supabase
        .from('item_places')
        .select('place_id, lat, lng, location_fetched_at')
        .eq('item_id', itemId)
        .not('place_id', 'is', null)
    : { data: [] };
  const now = new Date();
  const locations = await locatePlaces(places, reusableLocations(existing ?? [], now), now);
  return toSavedPlaces(places, locations);
}

// 刪除是軟刪除，畫面上提供「復原」（Q13）。
export async function deleteItem(itemId: string): Promise<ActionResult> {
  const result = await setDeletedAt('items', itemId, new Date().toISOString());
  if (result.ok) refresh();
  return result;
}

export async function restoreItem(itemId: string): Promise<ActionResult> {
  const result = await setDeletedAt('items', itemId, null);
  if (result.ok) refresh();
  return result;
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
