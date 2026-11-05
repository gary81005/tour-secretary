'use server';

import { refresh } from 'next/cache';
import { getSignedInClient } from '@/lib/auth/session';
import { fieldErrorsOf, formString, type ActionResult, type FormResult } from '@/lib/form';
import { setDeletedAt } from '@/lib/supabase/soft-delete';
import { travelerConstraintSchema } from '@/lib/trip/schemas';
import { isUuid } from '@/lib/uuid';

// 旅伴限制的 Server Actions（Q9）。

export async function saveConstraint(
  tripId: string,
  constraintId: string | null,
  formData: FormData,
): Promise<FormResult> {
  if (!isUuid(tripId) || (constraintId !== null && !isUuid(constraintId))) {
    return { ok: false, error: 'notFound' };
  }

  const parsed = travelerConstraintSchema.safeParse({
    kind: formString(formData, 'kind'),
    subject: formString(formData, 'subject'),
    content: formString(formData, 'content'),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  if (constraintId) {
    const { data, error } = await supabase
      .from('traveler_constraints')
      .update(parsed.data)
      .eq('id', constraintId)
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .select('id');
    if (error) return { ok: false, error: 'unknown' };
    if (data.length === 0) return { ok: false, error: 'notFound' };
  } else {
    const { error } = await supabase
      .from('traveler_constraints')
      .insert({ ...parsed.data, trip_id: tripId });
    // RLS 擋下（不是成員或行程在垃圾桶）時是 42501。
    if (error) return { ok: false, error: error.code === '42501' ? 'notFound' : 'unknown' };
  }

  refresh();
  return { ok: true };
}

export async function deleteConstraint(constraintId: string): Promise<ActionResult> {
  const result = await setDeletedAt('traveler_constraints', constraintId, new Date().toISOString());
  if (result.ok) refresh();
  return result;
}

export async function restoreConstraint(constraintId: string): Promise<ActionResult> {
  const result = await setDeletedAt('traveler_constraints', constraintId, null);
  if (result.ok) refresh();
  return result;
}
