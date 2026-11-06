'use server';

import { hasLocale } from 'next-intl';
import { refresh } from 'next/cache';
import { z } from 'zod';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getSignedInClient } from '@/lib/auth/session';
import {
  fieldErrorsOf,
  formString,
  type ActionResult,
  type FormResult,
  type FormState,
} from '@/lib/form';
import { blockedDatesOf, rpcErrorKey } from '@/lib/rpc-errors';
import { tripCreateSchema, tripDateRangeSchema, tripUpdateSchema } from '@/lib/trip/schemas';
import { isUuid } from '@/lib/uuid';

// 行程的 Server Actions（Q11）。每個 action 都重新確認登入，權限最後由 RLS 把關。
// next/root-params 在 Server Action 不能用，需要語系的地方由呼叫端傳入。

export type CreateTripValues = {
  name: string;
  startDate: string;
  endDate: string;
  timezone: string;
};

export async function createTrip(
  locale: string,
  _previous: FormState<CreateTripValues>,
  formData: FormData,
): Promise<FormState<CreateTripValues>> {
  const values: CreateTripValues = {
    name: formString(formData, 'name'),
    startDate: formString(formData, 'startDate'),
    endDate: formString(formData, 'endDate'),
    timezone: formString(formData, 'timezone'),
  };

  const parsed = tripCreateSchema.safeParse(values);
  if (!parsed.success) return { values, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { values, error: 'unauthorized' };

  const { data: tripId, error } = await supabase.rpc('create_trip', {
    p_name: parsed.data.name,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_timezone: parsed.data.timezone,
  });
  if (error || !tripId) return { values, error: 'unknown' };

  // 建好直接進行程頁（第 1 天）。
  return redirect({
    href: `/trips/${tripId}`,
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
  });
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
  if (error) return { ok: false, error: 'unknown' };
  // RLS 擋掉或行程不存在時，update 不會報錯，只是影響 0 筆。
  return data.length > 0 ? { ok: true } : { ok: false, error: 'notFound' };
}

// 永久刪除（只有 owner 能做，RLS 把關）。要輸入行程名稱確認（Q14）。
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

// 修改起訖日：以日期對應（Q15）；要刪的天還有項目時擋下，並回傳那些日期。
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
