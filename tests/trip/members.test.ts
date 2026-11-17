import { describe, expect, it } from 'vitest';
import { sortMembers, tripCompanions, type TripMember } from '@/lib/trip/members';

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

describe('tripCompanions', () => {
  const at = (minute: number) => `2026-11-17T02:${String(minute).padStart(2, '0')}:00Z`;
  const members = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ user_id: `u${index}`, created_at: at(index) }));
  const profiles = new Map([
    ['u1', { display_name: ' 阿美 ', avatar_url: 'https://example.com/amy.png' }],
    ['u2', { display_name: null, avatar_url: null }],
  ]);

  it('只有自己時沒有頭像', () => {
    expect(tripCompanions(members(1), 'u0', profiles)).toEqual({ avatars: [], more: 0 });
  });

  it('排掉自己，依加入時間排；沒有 profile 時名稱與頭像是 null', () => {
    const result = tripCompanions(members(4).toReversed(), 'u0', profiles);
    expect(result.avatars).toEqual([
      { userId: 'u1', displayName: '阿美', avatarUrl: 'https://example.com/amy.png' },
      { userId: 'u2', displayName: null, avatarUrl: null },
      { userId: 'u3', displayName: null, avatarUrl: null },
    ]);
    expect(result.more).toBe(0);
  });

  it('超過 3 位時其他的算在 +N', () => {
    const result = tripCompanions(members(6), 'u0', profiles);
    expect(result.avatars.map((avatar) => avatar.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(result.more).toBe(2);
  });
});
