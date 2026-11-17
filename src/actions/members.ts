'use server';

import { refresh } from 'next/cache';
import { getSignedInClient } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/form';
import { rpcErrorKey } from '@/lib/rpc-errors';
import { isUuid } from '@/lib/uuid';

// 旅伴名單頁的 Server Actions（ADR 0005「M5 旅伴與權限」）。權限由資料庫函式把關：
// 重設連結、移除旅伴只有主辦人（42501 owner_only）；主辦人不能退出（owner_cannot_leave）。

export async function resetInviteLink(tripId: string): Promise<ActionResult> {
  if (!isUuid(tripId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('reset_trip_invite', { p_trip_id: tripId });
  if (error) return { ok: false, error: rpcErrorKey(error) };

  refresh();
  return { ok: true };
}

// resetInvite：同時重設邀請連結，不然被移除的人可以用原本的連結再加入（Q14）。
export async function removeMember(
  tripId: string,
  userId: string,
  resetInvite: boolean,
): Promise<ActionResult> {
  if (!isUuid(tripId) || !isUuid(userId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('remove_trip_member', {
    p_trip_id: tripId,
    p_user_id: userId,
    p_reset_invite: resetInvite,
  });
  if (error) return { ok: false, error: rpcErrorKey(error) };

  refresh();
  return { ok: true };
}

// 退出行程。呼叫端負責顯示提示並離開行程頁，這裡不 refresh，避免先閃出 404。
export async function leaveTrip(tripId: string): Promise<ActionResult> {
  if (!isUuid(tripId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('leave_trip', { p_trip_id: tripId });
  if (error) return { ok: false, error: rpcErrorKey(error) };
  return { ok: true };
}
