import 'server-only';
import { buildOfflineSnapshot, type OfflineSnapshot } from '@/lib/offline/snapshot';
import { createClient } from '@/lib/supabase/server';
import { getTravelerConstraints, getTrip, getTripDays, getTripNotes, getTripStays } from './trips';

// 離線快照的資料（ADR 0010 Q11）：整趟行程的每一天、項目、住宿、提醒事項、旅伴限制。
// 行程 layout 在進行中或 7 天內出發時呼叫，交給瀏覽器存進 IndexedDB。
// getTrip、getTripDays、getTripStays 有 React cache，和頁面共用同一次查詢。
export async function getOfflineSnapshot(tripId: string): Promise<OfflineSnapshot | null> {
  const [trip, days, items, stays, notes, constraints] = await Promise.all([
    getTrip(tripId),
    getTripDays(tripId),
    getTripItems(tripId),
    getTripStays(tripId),
    getTripNotes(tripId),
    getTravelerConstraints(tripId),
  ]);
  if (!trip) return null;

  return buildOfflineSnapshot({ trip, days, items, stays, notes, constraints }, new Date());
}

// 整趟行程的項目（未刪除），不取座標（不存進手機，ADR 0006）。
async function getTripItems(tripId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('items')
    .select(
      'id, day_id, title, time_slot, category, start_time, end_time, description, url, position, done_at, item_places (id, name, position, place_id), fallbacks (id, condition, alternative, position)',
    )
    .eq('trip_id', tripId)
    .is('deleted_at', null);
  if (error) throw error;
  return data;
}
