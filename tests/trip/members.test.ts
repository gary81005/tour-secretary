import { describe, expect, it } from 'vitest';
import { sortMembers, type TripMember } from '@/lib/trip/members';

function member(userId: string, role: TripMember['role'], joinedAt: string): TripMember {
  return { userId, role, joinedAt, displayName: null, avatarUrl: null, isSelf: false };
}

describe('sortMembers', () => {
  it('主辦人排第一，其他依加入時間', () => {
    const sorted = sortMembers([
      member('c', 'member', '2026-11-17T03:00:00Z'),
      member('b', 'member', '2026-11-17T02:00:00Z'),
      member('a', 'owner', '2026-11-17T04:00:00Z'),
    ]);
    expect(sorted.map((m) => m.userId)).toEqual(['a', 'b', 'c']);
  });

  it('同一時間加入時依使用者 id，順序固定', () => {
    const sorted = sortMembers([
      member('y', 'member', '2026-11-17T02:00:00Z'),
      member('x', 'member', '2026-11-17T02:00:00Z'),
    ]);
    expect(sorted.map((m) => m.userId)).toEqual(['x', 'y']);
  });
});
