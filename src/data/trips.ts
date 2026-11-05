import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/uuid';
import { groupTripsByPhase, summarizeTrip } from '@/lib/trip/trip-list';

// 讀取行程的查詢。權限由 RLS 把關（只看得到自己是成員的行程）；
// 軟刪除不在 RLS 過濾，所以每個查詢都要自己加 deleted_at 條件（CLAUDE.md「Database」）。
// 這些函式會讀 cookie，呼叫端要放在 <Suspense> 裡。

// 行程列表：依進行中／即將出發／已結束分組。
export async function getTripListGroups() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trips')
    .select('id, name, start_date, end_date, default_timezone, days (date, city, timezone)')
    .is('deleted_at', null);
  if (error) throw error;

  const now = new Date();
  return groupTripsByPhase(data.map((trip) => summarizeTrip(trip, now)));
}

// React cache：同一個請求裡 generateMetadata 與頁面都會呼叫，只查一次資料庫。
export const getTrip = cache(async (tripId: string) => {
  if (!isUuid(tripId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trips')
    .select('id, name, start_date, end_date, default_timezone')
    .eq('id', tripId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
});

// 垃圾桶：最近刪除的排最前。
export async function getTrashedTrips() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trips')
    .select('id, name, start_date, end_date, deleted_at')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return data.map((trip) => ({ ...trip, deleted_at: trip.deleted_at as string }));
}

// 行程的每一天，依日期排序。layout 與頁面都會用到，同一個請求只查一次。
export const getTripDays = cache(async (tripId: string) => {
  if (!isUuid(tripId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('days')
    .select('id, date, city, timezone')
    .eq('trip_id', tripId)
    .order('date');
  if (error) throw error;
  return data;
});

// 某一天的行程項目（未刪除），含依序排列的地點與備案。排序與分組交給 groupItemsBySlot。
export async function getDayItems(dayId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('items')
    // select 字串要是單一字面值，supabase-js 才推得出回傳型別（用 + 串接會變成錯誤型別）。
    .select(
      'id, title, time_slot, category, start_time, end_time, description, url, position, item_places (id, name, position), fallbacks (id, condition, alternative, position)',
    )
    .eq('day_id', dayId)
    .is('deleted_at', null)
    .order('position', { referencedTable: 'item_places' })
    .order('position', { referencedTable: 'fallbacks' });
  if (error) throw error;
  return data;
}

export type DayItem = Awaited<ReturnType<typeof getDayItems>>[number];
