import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { tripCompanions } from '@/lib/trip/members';
import { groupTripsByPhase, summarizeTrip } from '@/lib/trip/trip-list';
import { isUuid } from '@/lib/uuid';

// 讀取行程的查詢。權限由 RLS 把關（只看得到自己是成員的行程）；
// 軟刪除不在 RLS 過濾，所以每個查詢都要自己加 deleted_at 條件（CLAUDE.md「Database」）。
// 這些函式會讀 cookie，呼叫端要放在 <Suspense> 裡。

// 行程列表：依進行中／即將出發／已結束分組。卡片上顯示自己以外的旅伴頭像（ADR 0005 Q12）；
// profiles 和 trip_members 之間沒有外鍵，另外查一次。
export async function getTripListGroups() {
  const supabase = await createClient();
  const [{ data: auth }, { data, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase
      .from('trips')
      .select(
        'id, name, start_date, end_date, default_timezone, days (date, city, timezone), trip_members (user_id, created_at)',
      )
      .is('deleted_at', null),
  ]);
  if (error) throw error;

  const selfId = auth?.claims.sub ?? null;
  const otherIds = [
    ...new Set(data.flatMap((trip) => trip.trip_members.map((member) => member.user_id))),
  ].filter((id) => id !== selfId);
  const { data: profiles, error: profileError } =
    otherIds.length > 0
      ? await supabase.from('profiles').select('id, display_name, avatar_url').in('id', otherIds)
      : { data: [], error: null };
  if (profileError) throw profileError;
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const now = new Date();
  return groupTripsByPhase(
    data.map((trip) =>
      summarizeTrip(trip, now, tripCompanions(trip.trip_members, selfId, profileById)),
    ),
  );
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

export type TrashedTrip = Awaited<ReturnType<typeof getTrashedTrips>>[number];

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
      'id, title, time_slot, category, start_time, end_time, description, url, position, done_at, skipped_at, updated_at, replaces_item_id, item_places (id, name, position, place_id, lat, lng, location_fetched_at), fallbacks (id, condition, alternative, position)',
    )
    .eq('day_id', dayId)
    .is('deleted_at', null)
    .order('position', { referencedTable: 'item_places' })
    .order('position', { referencedTable: 'fallbacks' });
  if (error) throw error;
  return data;
}

export type DayItem = Awaited<ReturnType<typeof getDayItems>>[number];

// 首頁進行中的行程：今天的項目，只取判斷「現在」需要的欄位（ADR 0010）。
export async function getTodayProgressItems(tripId: string, date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('items')
    .select('id, title, time_slot, start_time, position, done_at, skipped_at, days!inner (date)')
    .eq('trip_id', tripId)
    .eq('days.date', date)
    .is('deleted_at', null);
  if (error) throw error;
  return data;
}

// 住宿（未刪除），依入住日排序。行程分頁的「今晚住」與住宿分頁都會用到。
export const getTripStays = cache(async (tripId: string) => {
  if (!isUuid(tripId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stays')
    .select(
      'id, name, check_in, check_out, address, status, confirmation_code, url, note, place_id, lat, lng, location_fetched_at',
    )
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('check_in')
    .order('check_out');
  if (error) throw error;
  return data;
});

export type TripStay = Awaited<ReturnType<typeof getTripStays>>[number];

// 提醒事項（未刪除），依手動順序。
export async function getTripNotes(tripId: string) {
  if (!isUuid(tripId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trip_notes')
    .select('id, topic, content, position')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('position')
    .order('created_at');
  if (error) throw error;
  return data;
}

export type TripNote = Awaited<ReturnType<typeof getTripNotes>>[number];

// 旅伴限制（未刪除），依建立時間；畫面上再依類型分組。
export async function getTravelerConstraints(tripId: string) {
  if (!isUuid(tripId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('traveler_constraints')
    .select('id, kind, subject, content')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw error;
  return data;
}

export type TravelerConstraint = Awaited<ReturnType<typeof getTravelerConstraints>>[number];
