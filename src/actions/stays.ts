'use server';

import { refresh } from 'next/cache';
import { getSignedInClient } from '@/lib/auth/session';
import { fieldErrorsOf, formString, type ActionResult, type FormResult } from '@/lib/form';
import { setDeletedAt } from '@/lib/supabase/soft-delete';
import { staySchema } from '@/lib/trip/schemas';
import { validateStayRange } from '@/lib/trip/stays';
import { isUuid } from '@/lib/uuid';

// 住宿的 Server Actions（Q8、Q23）。

export async function saveStay(
  tripId: string,
  stayId: string | null,
  formData: FormData,
): Promise<FormResult> {
  if (!isUuid(tripId) || (stayId !== null && !isUuid(stayId))) {
    return { ok: false, error: 'notFound' };
  }

  const parsed = staySchema.safeParse({
    name: formString(formData, 'name'),
    checkIn: formString(formData, 'checkIn'),
    checkOut: formString(formData, 'checkOut'),
    address: formString(formData, 'address'),
    status: formString(formData, 'status'),
    confirmationCode: formString(formData, 'confirmationCode'),
    url: formString(formData, 'url'),
    note: formString(formData, 'note'),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data: trip } = await supabase
    .from('trips')
    .select('start_date, end_date')
    .eq('id', tripId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!trip) return { ok: false, error: 'notFound' };

  const stay = parsed.data;
  // 入住到退房要在行程日期內，退房日可以是最後一天（Q23）。
  if (validateStayRange({ check_in: stay.checkIn, check_out: stay.checkOut }, trip)) {
    return { ok: false, fieldErrors: { checkIn: 'outsideTrip' } };
  }

  const row = {
    name: stay.name,
    check_in: stay.checkIn,
    check_out: stay.checkOut,
    address: stay.address,
    status: stay.status,
    confirmation_code: stay.confirmationCode,
    url: stay.url,
    note: stay.note,
  };
  const { data, error } = stayId
    ? await supabase
        .from('stays')
        .update(row)
        .eq('id', stayId)
        .eq('trip_id', tripId)
        .is('deleted_at', null)
        .select('id')
    : await supabase
        .from('stays')
        .insert({ ...row, trip_id: tripId })
        .select('id');
  if (error) return { ok: false, error: 'unknown' };
  if (data.length === 0) return { ok: false, error: 'notFound' };

  refresh();
  return { ok: true };
}

export async function deleteStay(stayId: string): Promise<ActionResult> {
  const result = await setDeletedAt('stays', stayId, new Date().toISOString());
  if (result.ok) refresh();
  return result;
}

export async function restoreStay(stayId: string): Promise<ActionResult> {
  const result = await setDeletedAt('stays', stayId, null);
  if (result.ok) refresh();
  return result;
}
