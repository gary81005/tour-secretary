import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { isAdjustmentUndoable } from '@/lib/trip/adjustments';
import { isUuid } from '@/lib/uuid';

// 臨時調整的查詢（ADR 0009「M6 細節」）。讀 cookie，呼叫端要放在 <Suspense> 裡。

// 行程選單的「復原上次調整」：行程最近一次的調整還能復原時回傳它的 id，否則 null。
// 所有旅伴都能復原（和調整一樣）。
export async function getUndoableAdjustmentId(tripId: string): Promise<string | null> {
  if (!isUuid(tripId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trip_adjustments')
    .select('id, created_at, undone_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // new Date() 要在讀過請求資料之後（Cache Components 的 blocking-prerender-current-time）。
  return isAdjustmentUndoable(data, new Date()) ? data.id : null;
}
