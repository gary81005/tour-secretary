import { describe, expect, it } from 'vitest';
import { canMarkDone } from '@/lib/trip/progress';

describe('canMarkDone', () => {
  it('今天與之前的天可以打勾，未來的天不行', () => {
    expect(canMarkDone('2027-03-05', '2027-03-06')).toBe(true);
    expect(canMarkDone('2027-03-06', '2027-03-06')).toBe(true);
    expect(canMarkDone('2027-03-07', '2027-03-06')).toBe(false);
  });
});
