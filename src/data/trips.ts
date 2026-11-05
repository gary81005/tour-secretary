import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { groupTripsByPhase, summarizeTrip } from '@/lib/trip/trip-list';

// 讀取行程的查詢。權限由 RLS 把關（只看得到自己是成員的行程）；
// 軟刪除不在 RLS 過濾，所以每個查詢都要自己加 deleted_at 條件（CLAUDE.md「Database」）。
// 這些函式會讀 cookie，呼叫端要放在 <Suspense> 裡。

const tripIdSchema = z.uuid();

export function isTripId(value: string): boolean {
  return tripIdSchema.safeParse(value).success;
}

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
  if (!isTripId(tripId)) return null;

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
