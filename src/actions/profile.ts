'use server';

import { refresh } from 'next/cache';
import { getSignedInSession } from '@/lib/auth/session';
import { fieldErrorsOf, formString, type FormResult } from '@/lib/form';
import { displayNameSchema } from '@/lib/trip/schemas';

// 自己的 profile（ADR 0005「M5 旅伴與權限」）：帳號選單的「我的名稱」。

export async function updateDisplayName(formData: FormData): Promise<FormResult> {
  const parsed = displayNameSchema.safeParse({ displayName: formString(formData, 'displayName') });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const session = await getSignedInSession();
  if (!session) return { ok: false, error: 'unauthorized' };

  const { error } = await session.supabase
    .from('profiles')
    .update({ display_name: parsed.data.displayName })
    .eq('id', session.userId);
  if (error) return { ok: false, error: 'unknown' };

  refresh();
  return { ok: true };
}
