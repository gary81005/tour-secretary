import { describe, expect, it } from 'vitest';
import { localDate, localTime, resolveTimezone } from '@/lib/trip/timezones';

describe('localDate', () => {
  it('依時區換算日期，不看裝置時區', () => {
    const now = new Date('2027-03-05T16:30:00Z'); // 東京 3/6 01:30、台北 3/6 00:30、UTC 3/5
    expect(localDate('Asia/Tokyo', now)).toBe('2027-03-06');
    expect(localDate('Asia/Taipei', now)).toBe('2027-03-06');
    expect(localDate('UTC', now)).toBe('2027-03-05');
  });
});

describe('localTime', () => {
  it('依時區換算時間，24 小時制', () => {
    const now = new Date('2027-03-05T16:30:00Z');
    expect(localTime('Asia/Tokyo', now)).toBe('01:30');
    expect(localTime('Europe/London', new Date('2027-03-05T14:05:00Z'))).toBe('14:05');
  });
});

describe('resolveTimezone', () => {
  it('天沒有設定時區就沿用行程預設', () => {
    expect(resolveTimezone({ timezone: null }, 'Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(resolveTimezone({ timezone: 'Asia/Taipei' }, 'Asia/Tokyo')).toBe('Asia/Taipei');
  });
});
