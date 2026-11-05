import { describe, expect, it } from 'vitest';
import { blockedDatesOf, rpcErrorKey } from '@/lib/rpc-errors';

describe('rpcErrorKey', () => {
  it.each([
    [{ code: 'P0002', message: 'day not found' }, 'notFound'],
    [{ code: '40001', message: 'items changed' }, 'conflict'],
    [{ code: 'P0001', message: 'days_have_items' }, 'daysHaveItems'],
    [{ code: '22023', message: 'trip_too_long' }, 'tripTooLong'],
    [{ code: '22023', message: 'invalid_range' }, 'tripTooLong'],
    [{ code: '22023', message: 'last_day' }, 'lastDay'],
    [{ code: '23514', message: 'new row violates check constraint' }, 'unknown'],
  ] as const)('%j → %s', (error, key) => {
    expect(rpcErrorKey(error)).toBe(key);
  });
});

describe('blockedDatesOf', () => {
  it('拆開 detail 的日期', () => {
    expect(blockedDatesOf({ details: '2027-03-05,2027-03-06' })).toEqual([
      '2027-03-05',
      '2027-03-06',
    ]);
    expect(blockedDatesOf({ details: null })).toEqual([]);
    expect(blockedDatesOf({})).toEqual([]);
  });
});
