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
