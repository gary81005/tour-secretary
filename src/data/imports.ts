import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { ExistingTrip } from '@/lib/import/plan';
import { isImportUndoable } from '@/lib/import/undo';
import { isUuid } from '@/lib/uuid';
import { getTravelerConstraints, getTrip, getTripDays, getTripNotes, getTripStays } from './trips';

// 匯入用的查詢（ADR 0008）。和 trips.ts 一樣讀 cookie，呼叫端要放在 <Suspense> 裡。

// 匯入到既有行程時，預覽比對用的行程資料（planImport 的 ExistingTrip）。都只含未刪除的。
export async function getImportTarget(tripId: string): Promise<ExistingTrip | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;

  const [days, items, stays, notes, constraints] = await Promise.all([
    getTripDays(tripId),
    getTripItemTitles(tripId),
    getTripStays(tripId),
    getTripNotes(tripId),
    getTravelerConstraints(tripId),
  ]);
  return {
    startDate: trip.start_date,
    endDate: trip.end_date,
    days: days.map(({ date, city }) => ({ date, city })),
    items,
    stays: stays.map((stay) => ({
      name: stay.name,
      checkIn: stay.check_in,
      checkOut: stay.check_out,
    })),
    notes: notes.map(({ topic }) => ({ topic })),
    constraints: constraints.map(({ kind, content }) => ({ kind, content })),
  };
}

// 整趟行程的項目標題與日期：比對重複資料、備案改掛到既有項目時用。
async function getTripItemTitles(tripId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('items')
    .select('id, title, days (date)')
    .eq('trip_id', tripId)
    .is('deleted_at', null);
  if (error) throw error;
  return data.map((item) => ({ id: item.id, date: item.days.date, title: item.title }));
}

// 行程選單的「復原上次匯入」：最近一次匯入還能復原時回傳它的 id，否則 null。
export async function getUndoableImportId(tripId: string): Promise<string | null> {
  if (!isUuid(tripId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trip_imports')
    .select('id, created_at, undone_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // new Date() 要在讀過請求資料之後（Cache Components 的 blocking-prerender-current-time）。
  return isImportUndoable(data, new Date()) ? data.id : null;
}
