'use server';

import { z } from 'zod';
import { getSignedInClient } from '@/lib/auth/session';
import { getMapProvider } from '@/lib/maps/google';
import { needsDriving } from '@/lib/maps/legs';
import { isUuid } from '@/lib/uuid';

// 「用我的位置」（ADR 0009「M6 細節」）：手機把目前的座標送來，伺服器用 Google Routes 算步行到下一站的時間
// （API 金鑰不能給瀏覽器）。座標只用在這一次查詢：不存資料庫、不快取、不寫 log，也不給旅伴看。

export type WalkEstimate =
  | { ok: true; walkSeconds: number }
  // noPlace：下一站沒有連結地點；tooFar：步行超過 30 分鐘（要搭車，算不出時間）；
  // unavailable：沒有地圖金鑰、地圖服務出錯或算不出路線。都改回只看時間判斷。
  | { ok: false; reason: 'noPlace' | 'tooFar' | 'unavailable' };

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function estimateWalk(itemId: string, location: unknown): Promise<WalkEstimate> {
  const parsed = locationSchema.safeParse(location);
  if (!isUuid(itemId) || !parsed.success) return { ok: false, reason: 'unavailable' };

  const supabase = await getSignedInClient();
  const provider = getMapProvider();
  if (!supabase || !provider) return { ok: false, reason: 'unavailable' };

  // 目的地由伺服器查（RLS 只回傳成員看得到的項目），不相信瀏覽器傳來的地點 ID。
  // 和移動時間的段一樣，到達項目的第一個連結地點（planDayLegs）。
  const { data } = await supabase
    .from('item_places')
    .select('place_id, position, items!inner (deleted_at)')
    .eq('item_id', itemId)
    .is('items.deleted_at', null)
    .not('place_id', 'is', null)
    .order('position')
    .limit(1)
    .maybeSingle();
  if (!data?.place_id) return { ok: false, reason: 'noPlace' };

  try {
    const route = await provider.computeRoute(parsed.data, data.place_id, 'walk');
    if (!route) return { ok: false, reason: 'unavailable' };
    if (needsDriving(route.durationSeconds)) return { ok: false, reason: 'tooFar' };
    return { ok: true, walkSeconds: route.durationSeconds };
  } catch (error) {
    // 只記錯誤訊息（狀態碼），不記座標。
    console.error('walk estimate failed', error instanceof Error ? error.message : 'unknown');
    return { ok: false, reason: 'unavailable' };
  }
}
