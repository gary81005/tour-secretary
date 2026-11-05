'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';
import { getSignedInClient } from '@/lib/auth/session';
import { fieldErrorsOf, formString, type ActionResult, type FormResult } from '@/lib/form';
import { rpcErrorKey } from '@/lib/rpc-errors';
import { setDeletedAt } from '@/lib/supabase/soft-delete';
import { tripNoteSchema } from '@/lib/trip/schemas';
import { isUuid } from '@/lib/uuid';

// 提醒事項的 Server Actions（Q9、Q23）。

export async function saveNote(
  tripId: string,
  noteId: string | null,
  formData: FormData,
): Promise<FormResult> {
  if (!isUuid(tripId) || (noteId !== null && !isUuid(noteId))) {
    return { ok: false, error: 'notFound' };
  }

  const parsed = tripNoteSchema.safeParse({
    topic: formString(formData, 'topic'),
    content: formString(formData, 'content'),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  if (noteId) {
    const { data, error } = await supabase
      .from('trip_notes')
      .update(parsed.data)
      .eq('id', noteId)
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .select('id');
    if (error) return { ok: false, error: 'unknown' };
    if (data.length === 0) return { ok: false, error: 'notFound' };
  } else {
    // 新的提醒排在最後。
    const { data: last } = await supabase
      .from('trip_notes')
      .select('position')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from('trip_notes')
      .insert({ ...parsed.data, trip_id: tripId, position: (last?.position ?? -1) + 1 });
    // RLS 擋下（不是成員或行程在垃圾桶）時是 42501。
    if (error) return { ok: false, error: error.code === '42501' ? 'notFound' : 'unknown' };
  }

  refresh();
  return { ok: true };
}

export async function deleteNote(noteId: string): Promise<ActionResult> {
  const result = await setDeletedAt('trip_notes', noteId, new Date().toISOString());
  if (result.ok) refresh();
  return result;
}

export async function restoreNote(noteId: string): Promise<ActionResult> {
  const result = await setDeletedAt('trip_notes', noteId, null);
  if (result.ok) refresh();
  return result;
}

const reorderSchema = z.object({ tripId: z.uuid(), noteIds: z.array(z.uuid()).max(200) });

// 拖拉排序：noteIds 要是這趟行程全部未刪除的提醒，依新順序。
// 不論成功與否都 refresh()：衝突時讓畫面拿到最新內容。
export async function reorderNotes(tripId: string, noteIds: string[]): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse({ tripId, noteIds });
  if (!parsed.success) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('reorder_trip_notes', {
    p_trip_id: parsed.data.tripId,
    p_note_ids: parsed.data.noteIds,
  });
  refresh();
  if (error) return { ok: false, error: rpcErrorKey(error) };
  return { ok: true };
}
