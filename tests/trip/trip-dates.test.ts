import { describe, expect, it } from 'vitest';
import { addDays, countDays, listDates, planDateRangeChange } from '@/lib/trip/trip-dates';

describe('日期計算', () => {
  it('跨月、跨年、閏年', () => {
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('countDays 含頭含尾', () => {
    expect(countDays('2027-03-05', '2027-03-05')).toBe(1);
    expect(countDays('2027-03-05', '2027-03-14')).toBe(10);
  });

  it('listDates', () => {
    expect(listDates('2027-03-30', '2027-04-02')).toEqual([
      '2027-03-30',
      '2027-03-31',
      '2027-04-01',
      '2027-04-02',
    ]);
    expect(listDates('2027-03-05', '2027-03-04')).toEqual([]);
  });
});

describe('planDateRangeChange', () => {
  const days = [
    { id: 'd1', date: '2027-03-05' },
    { id: 'd2', date: '2027-03-06' },
    { id: 'd3', date: '2027-03-07' },
  ];

  it('延長：只新增缺少的日期', () => {
    const plan = planDateRangeChange(days, '2027-03-04', '2027-03-08');
    expect(plan.removed).toEqual([]);
    expect(plan.added).toEqual(['2027-03-04', '2027-03-08']);
  });

  it('晚一天出發：刪掉第 1 天', () => {
    const plan = planDateRangeChange(days, '2027-03-06', '2027-03-07');
    expect(plan.removed.map((d) => d.id)).toEqual(['d1']);
    expect(plan.added).toEqual([]);
  });

  it('整個換到不重疊的日期：全部刪除、全部新增', () => {
    const plan = planDateRangeChange(days, '2027-04-01', '2027-04-02');
    expect(plan.removed).toHaveLength(3);
    expect(plan.added).toEqual(['2027-04-01', '2027-04-02']);
  });
});
