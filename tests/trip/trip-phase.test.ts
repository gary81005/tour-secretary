import { describe, expect, it } from 'vitest';
import { currentDayIndex, getTripPhase, localDate, resolveTimezone } from '@/lib/trip/trip-phase';

const tokyo = (date: string) => ({ date, timezone: 'Asia/Tokyo' });
const trip = [tokyo('2027-03-05'), tokyo('2027-03-06'), tokyo('2027-03-07')];

describe('localDate', () => {
  it('依時區換算日期，不看裝置時區', () => {
    const now = new Date('2027-03-05T16:30:00Z'); // 東京 3/6 01:30、台北 3/6 00:30、UTC 3/5
    expect(localDate('Asia/Tokyo', now)).toBe('2027-03-06');
    expect(localDate('Asia/Taipei', now)).toBe('2027-03-06');
    expect(localDate('UTC', now)).toBe('2027-03-05');
  });
});

describe('currentDayIndex / getTripPhase', () => {
  it('出發前', () => {
    const now = new Date('2027-03-04T14:59:00Z'); // 東京 3/4 23:59
    expect(currentDayIndex(trip, now)).toBe(-1);
    expect(getTripPhase(trip, now)).toBe('upcoming');
  });

  it('東京過午夜就是第 1 天', () => {
    const now = new Date('2027-03-04T15:00:00Z'); // 東京 3/5 00:00
    expect(currentDayIndex(trip, now)).toBe(0);
    expect(getTripPhase(trip, now)).toBe('ongoing');
  });

  it('最後一天', () => {
    const now = new Date('2027-03-07T14:59:00Z'); // 東京 3/7 23:59
    expect(currentDayIndex(trip, now)).toBe(2);
  });

  it('結束後', () => {
    const now = new Date('2027-03-07T15:00:00Z'); // 東京 3/8 00:00
    expect(currentDayIndex(trip, now)).toBe(-1);
    expect(getTripPhase(trip, now)).toBe('past');
  });

  it('跨時區換日的空檔算在前一天', () => {
    // 第 1 天在東京（UTC+9），第 2 天回台北（UTC+8）
    const days = [
      { date: '2027-03-05', timezone: 'Asia/Tokyo' },
      { date: '2027-03-06', timezone: 'Asia/Taipei' },
    ];
    // 東京已經 3/6 00:30（第 1 天結束了），台北還是 3/5 23:30（第 2 天還沒開始）
    const gap = new Date('2027-03-05T15:30:00Z');
    expect(currentDayIndex(days, gap)).toBe(0);
    expect(getTripPhase(days, gap)).toBe('ongoing');
    // 台北過午夜就是第 2 天
    expect(currentDayIndex(days, new Date('2027-03-05T16:00:00Z'))).toBe(1);
  });

  it('沒有天數時視為即將出發', () => {
    expect(getTripPhase([], new Date())).toBe('upcoming');
  });
});

describe('resolveTimezone', () => {
  it('天沒有設定時區就沿用行程預設', () => {
    expect(resolveTimezone({ timezone: null }, 'Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(resolveTimezone({ timezone: 'Asia/Taipei' }, 'Asia/Tokyo')).toBe('Asia/Taipei');
  });
});
