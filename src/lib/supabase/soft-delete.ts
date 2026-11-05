import 'server-only';
import { getSignedInClient } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/form';
import { isUuid } from '@/lib/uuid';

// 有 deleted_at 的資料表（Q13：刪除後可以復原；30 天後由 purge_deleted_rows() 永久刪除）。
export type SoftDeleteTable = 'items' | 'stays' | 'trip_notes' | 'traveler_constraints';

// 軟刪除（deletedAt 為時間）或復原（null）。權限由 RLS 把關；影響 0 筆時回傳 notFound。
export async function setDeletedAt(
  table: SoftDeleteTable,
  id: string,
  deletedAt: string | null,
): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: deletedAt })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: 'unknown' };
  return data.length > 0 ? { ok: true } : { ok: false, error: 'notFound' };
}
