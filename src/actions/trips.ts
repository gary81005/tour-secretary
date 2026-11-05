'use server';

import { hasLocale } from 'next-intl';
import { refresh } from 'next/cache';
import { isTripId } from '@/data/trips';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { fieldErrorsOf, formString, type ActionResult, type FormState } from '@/lib/form';
import { createClient } from '@/lib/supabase/server';
import { tripCreateSchema } from '@/lib/trip/schemas';

// 行程的 Server Actions（Q11）。每個 action 都重新確認登入，權限最後由 RLS 把關。
// next/root-params 在 Server Action 不能用，需要語系的地方由呼叫端傳入。

async function getSignedInClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ? supabase : null;
}

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
  if (!isTripId(tripId)) return { ok: false, error: 'notFound' };

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
  if (!isTripId(tripId)) return { ok: false, error: 'notFound' };

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
