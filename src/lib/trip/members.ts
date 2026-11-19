import { cleanDisplayName } from '@/lib/profile/display-name';
import type { Database } from '@/types/database';

// 旅伴名單（ADR 0005「M5 旅伴與權限」）。

// 旅伴上限（含主辦人），與 join_trip() 一致。
export const MAX_TRIP_MEMBERS = 20;

export type TripMember = {
  userId: string;
  role: Database['public']['Enums']['trip_role'];
  joinedAt: string;
  // 沒有設定名稱時是 null，畫面顯示「旅伴」。
  displayName: string | null;
  avatarUrl: string | null;
  isSelf: boolean;
};

// 主辦人排第一，其他依加入時間。
export function sortMembers(members: readonly TripMember[]): TripMember[] {
  return members.toSorted(
    (a, b) =>
      Number(b.role === 'owner') - Number(a.role === 'owner') ||
      a.joinedAt.localeCompare(b.joinedAt) ||
      a.userId.localeCompare(b.userId),
  );
}

// ---------------------------------------------------------------------------
// 首頁卡片的旅伴頭像（ADR 0005 Q12）：有其他旅伴時顯示最多 3 個，再多顯示「+N」；只有自己時不顯示。
// ---------------------------------------------------------------------------

export const MAX_CARD_AVATARS = 3;

export type CompanionAvatar = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type TripCompanions = {
  avatars: CompanionAvatar[];
  // 沒有顯示頭像的其他旅伴人數
  more: number;
};

export const NO_COMPANIONS: TripCompanions = { avatars: [], more: 0 };

type CompanionProfile = { display_name: string | null; avatar_url: string | null };

// 自己以外的旅伴，依加入時間排（主辦人通常最早）。
export function tripCompanions(
  members: readonly { user_id: string; created_at: string }[],
  selfId: string | null,
  profileById: ReadonlyMap<string, CompanionProfile>,
): TripCompanions {
  const others = members
    .filter((member) => member.user_id !== selfId)
    .toSorted(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.user_id.localeCompare(b.user_id),
    );
  return {
    avatars: others.slice(0, MAX_CARD_AVATARS).map((member) => {
      const profile = profileById.get(member.user_id);
      return {
        userId: member.user_id,
        displayName: cleanDisplayName(profile?.display_name),
        avatarUrl: profile?.avatar_url ?? null,
      };
    }),
    more: Math.max(others.length - MAX_CARD_AVATARS, 0),
  };
}
