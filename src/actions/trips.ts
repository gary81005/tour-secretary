'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { getSignedInClient } from '@/lib/auth/session';
import {
  fieldErrorsOf,
  formString,
  type ActionErrorKey,
  type ActionResult,
  type FieldErrors,
  type FormResult,
} from '@/lib/form';
import { blockedDatesOf, rpcErrorKey } from '@/lib/rpc-errors';
import { tripCreateSchema, tripDateRangeSchema, tripUpdateSchema } from '@/lib/trip/schemas';
import { isUuid } from '@/lib/uuid';

// 行程的 Server Actions（ADR 0004 Q11）。每個 action 都重新確認登入，權限最後由 RLS 把關。

export type CreateTripResult =
  { ok: true; tripId: string } | { ok: false; fieldErrors?: FieldErrors; error?: ActionErrorKey };

// 建立行程。成功時回傳 tripId，由畫面導到行程頁（第 1 天），和「匯入新行程」相同。
export async function createTrip(formData: FormData): Promise<CreateTripResult> {
  const parsed = tripCreateSchema.safeParse({
    name: formString(formData, 'name'),
    startDate: formString(formData, 'startDate'),
    endDate: formString(formData, 'endDate'),
    timezone: formString(formData, 'timezone'),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data: tripId, error } = await supabase.rpc('create_trip', {
    p_name: parsed.data.name,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_timezone: parsed.data.timezone,
  });
  if (error || !tripId) return { ok: false, error: 'unknown' };
  return { ok: true, tripId };
}

// 移到垃圾桶。呼叫端負責顯示提示並離開行程頁，這裡不 refresh，避免先閃出 404。
export async function moveTripToTrash(tripId: string): Promise<ActionResult> {
  return setDeletedAt(tripId, new Date().toISOString());
}

export async function restoreTrip(tripId: string): Promise<ActionResult> {
  const result = await setDeletedAt(tripId, null);
  if (result.ok) refresh();
  return result;
}

async function setDeletedAt(tripId: string, deletedAt: string | null): Promise<ActionResult> {
  if (!isUuid(tripId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data, error } = await supabase
    .from('trips')
    .update({ deleted_at: deletedAt })
    .eq('id', tripId)
    .select('id');
  // 旅伴改 deleted_at 會被 RLS 的 with check 擋下（42501，只有主辦人能移到垃圾桶與復原）。
  if (error) return { ok: false, error: error.code === '42501' ? 'ownerOnly' : 'unknown' };
  // 不是成員、行程不存在，或旅伴要復原垃圾桶裡（看不到）的行程時，update 不會報錯，只是影響 0 筆。
  return data.length > 0 ? { ok: true } : { ok: false, error: 'notFound' };
}

// 永久刪除（只有 owner 能做，RLS 把關）。要輸入行程名稱確認（ADR 0004 Q14）。
export async function deleteTripPermanently(
  tripId: string,
  confirmName: string,
): Promise<ActionResult> {
  if (!isUuid(tripId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data: trip, error: readError } = await supabase
    .from('trips')
    .select('name')
    .eq('id', tripId)
    .not('deleted_at', 'is', null)
    .maybeSingle();
  if (readError) return { ok: false, error: 'unknown' };
  if (!trip) return { ok: false, error: 'notFound' };
  if (confirmName.trim() !== trip.name) return { ok: false, error: 'nameMismatch' };

  const { data, error } = await supabase.from('trips').delete().eq('id', tripId).select('id');
  if (error) return { ok: false, error: 'unknown' };
  if (data.length === 0) return { ok: false, error: 'notFound' };

  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 行程設定（第 9 步）：改名稱與預設時區、整趟平移、修改起訖日。
// ---------------------------------------------------------------------------

export async function updateTrip(tripId: string, formData: FormData): Promise<FormResult> {
  if (!isUuid(tripId)) return { ok: false, error: 'notFound' };

  const parsed = tripUpdateSchema.safeParse({
    name: formString(formData, 'name'),
    defaultTimezone: formString(formData, 'defaultTimezone'),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data, error } = await supabase
    .from('trips')
    .update({ name: parsed.data.name, default_timezone: parsed.data.defaultTimezone })
    .eq('id', tripId)
    .is('deleted_at', null)
    .select('id');
  if (error) return { ok: false, error: 'unknown' };
  if (data.length === 0) return { ok: false, error: 'notFound' };

  refresh();
  return { ok: true };
}

// 整趟平移：使用者選新的出發日，平移天數由 shift_trip() 用當下的出發日計算（避免先讀後算的競態）。
export async function shiftTrip(tripId: string, formData: FormData): Promise<FormResult> {
  if (!isUuid(tripId)) return { ok: false, error: 'notFound' };

  const parsed = z
    .object({ startDate: z.iso.date({ error: 'invalidDate' }) })
    .safeParse({ startDate: formString(formData, 'startDate') });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('shift_trip', {
    p_trip_id: tripId,
    p_start_date: parsed.data.startDate,
  });
  if (error) return { ok: false, error: rpcErrorKey(error) };

  refresh();
  return { ok: true };
}

export type SetTripDatesResult =
  FormResult | { ok: false; error: 'daysHaveItems'; blockedDates: string[] };

// 修改起訖日：以日期對應（ADR 0004 Q15）；要刪的天還有項目時擋下，並回傳那些日期。
export async function setTripDates(
  tripId: string,
  formData: FormData,
): Promise<SetTripDatesResult> {
  if (!isUuid(tripId)) return { ok: false, error: 'notFound' };

  const parsed = tripDateRangeSchema.safeParse({
    startDate: formString(formData, 'startDate'),
    endDate: formString(formData, 'endDate'),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('set_trip_dates', {
    p_trip_id: tripId,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
  });
  if (error) {
    const key = rpcErrorKey(error);
    return key === 'daysHaveItems'
      ? { ok: false, error: key, blockedDates: blockedDatesOf(error) }
      : { ok: false, error: key };
  }

  refresh();
  return { ok: true };
}
