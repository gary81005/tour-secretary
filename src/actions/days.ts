'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { getSignedInClient } from '@/lib/auth/session';
import { fieldErrorsOf, formString, type ActionResult, type FormResult } from '@/lib/form';
import { rpcErrorKey } from '@/lib/rpc-errors';
import { dayUpdateSchema } from '@/lib/trip/schemas';
import { isUuid } from '@/lib/uuid';

// 天的 Server Actions（第 9 步）。

const dayFormSchema = dayUpdateSchema.extend({
  // 城市一併套用到哪一天（含）；空字串表示只改這一天。
  cityUntil: z.union([z.literal(''), z.iso.date()]),
});

// 改城市與時區。城市可以一次套用到之後連續幾天（Q21）。
export async function updateDay(dayId: string, formData: FormData): Promise<FormResult> {
  if (!isUuid(dayId)) return { ok: false, error: 'notFound' };

  const parsed = dayFormSchema.safeParse({
    city: formString(formData, 'city'),
    timezone: formString(formData, 'timezone'),
    cityUntil: formString(formData, 'cityUntil'),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  // RLS：不是成員或行程在垃圾桶裡時查不到。
  const { data: day } = await supabase
    .from('days')
    .select('trip_id, date')
    .eq('id', dayId)
    .maybeSingle();
  if (!day) return { ok: false, error: 'notFound' };

  const { city, timezone, cityUntil } = parsed.data;
  const { error } = await supabase.from('days').update({ city, timezone }).eq('id', dayId);
  if (error) return { ok: false, error: 'unknown' };

  if (cityUntil && cityUntil > day.date) {
    const { error: rangeError } = await supabase
      .from('days')
      .update({ city })
      .eq('trip_id', day.trip_id)
      .gt('date', day.date)
      .lte('date', cityUntil);
    if (rangeError) return { ok: false, error: 'unknown' };
  }

  refresh();
  return { ok: true };
}

export async function insertDayAfter(dayId: string): Promise<ActionResult> {
  return callDayRpc('insert_day_after', dayId);
}

// 刪除一天（連同項目），之後的日期往前移（Q15）。畫面上有項目時會先確認。
export async function deleteDay(dayId: string): Promise<ActionResult> {
  return callDayRpc('delete_day', dayId);
}

async function callDayRpc(
  fn: 'insert_day_after' | 'delete_day',
  dayId: string,
): Promise<ActionResult> {
  if (!isUuid(dayId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc(fn, { p_day_id: dayId });
  if (error) return { ok: false, error: rpcErrorKey(error) };

  refresh();
  return { ok: true };
}
