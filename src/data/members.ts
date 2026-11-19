import 'server-only';
import { cache } from 'react';
import { cleanDisplayName } from '@/lib/profile/display-name';
import { createClient } from '@/lib/supabase/server';
import { sortMembers, type TripMember } from '@/lib/trip/members';
import { isUuid } from '@/lib/uuid';

// 旅伴與邀請連結的查詢（ADR 0005「M5 旅伴與權限」）。會讀 cookie，呼叫端要放在 <Suspense> 裡。

// 自己是不是主辦人：決定畫面要不要顯示主辦人專屬的功能（ADR 0005 Q11）。權限仍由 RLS 與函式把關。
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

// 邀請頁（登入後）要顯示的內容。連結無效時是 null；行程在垃圾桶時只有狀態，不透露行程內容。
// get_trip_invite 產生的型別把每個欄位都當成非 null，這裡依狀態整理成正確的型別。
export type JoinableTripInvite = {
  tripId: string;
  name: string;
  startDate: string;
  endDate: string;
  // 主辦人沒有設定名稱或頭像時是 null。
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  memberCount: number;
};

export type TripInvite =
  { status: 'trashed' } | ({ status: 'joinable' | 'member' | 'full' } & JoinableTripInvite);

const INVITE_STATUSES = new Set(['joinable', 'member', 'full']);

export async function getTripInvite(token: string): Promise<TripInvite | null> {
  if (!isUuid(token)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_trip_invite', { p_token: token }).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.status === 'trashed') return { status: 'trashed' };
  if (!INVITE_STATUSES.has(data.status)) return null;

  return {
    status: data.status as 'joinable' | 'member' | 'full',
    tripId: data.trip_id,
    name: data.name,
    startDate: data.start_date,
    endDate: data.end_date,
    ownerName: cleanDisplayName(data.owner_name),
    ownerAvatarUrl: (data.owner_avatar_url as string | null) ?? null,
    memberCount: data.member_count,
  };
}
