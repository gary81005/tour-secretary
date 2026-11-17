import 'server-only';
import { cache } from 'react';
import { cleanDisplayName } from '@/lib/profile/display-name';
import { createClient } from '@/lib/supabase/server';
import { sortMembers, type TripMember } from '@/lib/trip/members';
import { isUuid } from '@/lib/uuid';

// 旅伴與邀請連結的查詢（ADR 0005「M5 旅伴與權限」）。會讀 cookie，呼叫端要放在 <Suspense> 裡。

// 自己是不是主辦人：決定畫面要不要顯示主辦人專屬的功能（Q11）。權限仍由 RLS 與函式把關。
// layout 與頁面都會用到，同一個請求只查一次。
export const isTripOwner = cache(async (tripId: string) => {
  if (!isUuid(tripId)) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('is_trip_owner', { p_trip_id: tripId });
  if (error) throw error;
  return data;
});

// 旅伴名單：主辦人排第一，其他依加入時間。profiles 和 trip_members 之間沒有外鍵，分兩次查。
export async function getTripMembers(tripId: string): Promise<TripMember[]> {
  if (!isUuid(tripId)) return [];

  const supabase = await createClient();
  const [{ data: auth }, { data: members, error }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from('trip_members').select('user_id, role, created_at').eq('trip_id', tripId),
  ]);
  if (error) throw error;
  if (members.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in(
      'id',
      members.map((member) => member.user_id),
    );
  if (profileError) throw profileError;

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return sortMembers(
    members.map((member) => {
      const profile = profileById.get(member.user_id);
      return {
        userId: member.user_id,
        role: member.role,
        joinedAt: member.created_at,
        displayName: cleanDisplayName(profile?.display_name),
        avatarUrl: profile?.avatar_url ?? null,
        isSelf: member.user_id === auth?.claims.sub,
      };
    }),
  );
}

// 邀請連結的 token。只有主辦人讀得到（RLS），其他人是 null。
export async function getTripInviteToken(tripId: string): Promise<string | null> {
  if (!isUuid(tripId)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trip_invites')
    .select('token')
    .eq('trip_id', tripId)
    .maybeSingle();
  if (error) throw error;
  return data?.token ?? null;
}
