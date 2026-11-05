import { describe, expect, it } from 'vitest';
import { daysUntilPurge } from '@/lib/trip/trash';

describe('daysUntilPurge', () => {
  const deletedAt = '2027-03-01T00:00:00Z';

  it('剛刪除時還有 30 天', () => {
    expect(daysUntilPurge(deletedAt, new Date('2027-03-01T00:00:00Z'))).toBe(30);
  });

  it('無條件進位', () => {
    expect(daysUntilPurge(deletedAt, new Date('2027-03-01T01:00:00Z'))).toBe(30);
    expect(daysUntilPurge(deletedAt, new Date('2027-03-30T23:00:00Z'))).toBe(1);
  });

  it('過期但排程還沒清掉時是 0', () => {
    expect(daysUntilPurge(deletedAt, new Date('2027-04-05T00:00:00Z'))).toBe(0);
  });
});
