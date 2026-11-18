'use server';

import { refresh } from 'next/cache';
import { getSignedInClient } from '@/lib/auth/session';
import type { ActionErrorKey, ActionResult } from '@/lib/form';
import { rpcErrorKey } from '@/lib/rpc-errors';
import { adjustmentPlanSchema } from '@/lib/trip/adjustment-schema';
import type { AdjustmentPlan } from '@/lib/trip/adjustments';
import { isUuid } from '@/lib/uuid';

// 臨時調整（ADR 0009「M6 細節」）：套用調整方案、復原上次調整。所有旅伴都能做，權限由資料庫函式判斷。

export type ApplyAdjustmentResult =
  { ok: true; adjustmentId: string } | { ok: false; error: ActionErrorKey };

// 套用調整方案。方案裡的項目在預覽之後被改過（40001）時整筆不套用；
// 不論成功與否都 refresh()，衝突時讓畫面拿到最新內容再重新預覽。
export async function applyAdjustment(
  tripId: string,
  plan: AdjustmentPlan,
): Promise<ApplyAdjustmentResult> {
  const parsed = adjustmentPlanSchema.safeParse(plan);
  if (!isUuid(tripId) || !parsed.success) return { ok: false, error: 'invalidPlan' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data, error } = await supabase.rpc('apply_trip_adjustment', {
    p_trip_id: tripId,
    p_plan: parsed.data,
  });
  refresh();
  if (error) return { ok: false, error: rpcErrorKey(error) };
  return { ok: true, adjustmentId: data };
}

// 復原上次調整：只有行程最近一次、7 天內、還沒復原過的調整可以復原，由 undo_trip_adjustment() 判斷。
export async function undoAdjustment(adjustmentId: string): Promise<ActionResult> {
  if (!isUuid(adjustmentId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('undo_trip_adjustment', { p_adjustment_id: adjustmentId });
  refresh();
  if (error) return { ok: false, error: rpcErrorKey(error) };
  return { ok: true };
}
