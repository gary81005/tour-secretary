import { describe, expect, it } from 'vitest';
import { parseScheduleSheet } from '@/lib/import/schedule-sheet';
import { d, sheet } from './helpers';

describe('parseScheduleSheet', () => {
  const basic = sheet(
    '工作表1',
    [
      [d('2027-03-05'), null, d('2027-03-06'), null, d('2027-03-07'), null],
      ['東京', null, null, null, '仙台', null],
      ['約17:00', '抵達東京機場\n搭車前往飯店', '上午', '淺草寺、仲見世通', '上午', '東京退房'],
      ['晚餐', '東京市區用餐', '中午', '淺草午餐', null, null],
      [null, null, null, null, null, null],
      ['交通／預訂提醒', null, null, null, null, null],
    ],
    ['A1:B1', 'C1:D1', 'E1:F1', 'A2:D2', 'E2:F2'],
  );

  it('每天一組日期與城市，城市合併跨幾天就套用幾天', () => {
    expect(parseScheduleSheet(basic).days).toEqual([
      { date: '2027-03-05', city: '東京' },
      { date: '2027-03-06', city: '東京' },
      { date: '2027-03-07', city: '仙台' },
    ]);
  });

  it('解析每一格的時段、類別與內容', () => {
    const { items } = parseScheduleSheet(basic);
    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({
      key: '工作表1!B3',
      date: '2027-03-05',
      row: 2,
      timeSlot: 'evening',
      startTime: '17:00',
      endTime: null,
      category: 'transport',
      categorySource: 'keyword',
      timeSlotGuessed: false,
      title: '抵達東京機場',
      description: '搭車前往飯店',
    });
    expect(items.find((item) => item.key === '工作表1!B4')).toMatchObject({
      timeSlot: 'night',
      category: 'meal',
      categorySource: 'timeCell',
    });
    expect(items.find((item) => item.key === '工作表1!D3')).toMatchObject({
      category: 'sightseeing',
      categorySource: 'default',
    });
  });

  it('讀到第一個整列空白為止，之後還有內容時提示', () => {
    const { items, issues } = parseScheduleSheet(basic);
    expect(items.some((item) => item.title.includes('交通'))).toBe(false);
    expect(issues).toEqual([
      {
        severity: 'warning',
        code: 'rowsIgnored',
        sheet: '工作表1',
        cell: 'A6',
        params: { row: 6 },
      },
    ]);
  });

  it('時段認不出來時歸到整天並提醒', () => {
    const s = sheet('s', [[d('2027-03-05')], [null], ['隨時', '自由活動']]);
    const { items, issues } = parseScheduleSheet(s);
    expect(items[0]).toMatchObject({ timeSlot: 'all_day', timeSlotGuessed: true });
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'timeSlotUnrecognized',
        cell: 'A3',
        params: { value: '隨時' },
      }),
    );
  });

  it('只有時段沒有內容時略過並提醒', () => {
    const s = sheet('s', [[d('2027-03-05')], [null], ['上午', null]]);
    const { items, issues } = parseScheduleSheet(s);
    expect(items).toEqual([]);
    expect(issues).toContainEqual(expect.objectContaining({ code: 'emptyContent', cell: 'A3' }));
  });

  it('時段欄跨列合併時，每一列都套用', () => {
    const s = sheet(
      's',
      [[d('2027-03-05')], [null], ['上午', '淺草寺'], [null, '晴空塔']],
      ['A3:A4'],
    );
    const { items, issues } = parseScheduleSheet(s);
    expect(items.map((item) => item.timeSlot)).toEqual(['morning', 'morning']);
    expect(issues).toEqual([]);
  });

  it('城市寫在內容欄上方也可以', () => {
    const s = sheet('s', [
      [d('2027-03-05'), null],
      [null, '東京'],
      ['上午', '淺草寺'],
    ]);
    expect(parseScheduleSheet(s).days[0].city).toBe('東京');
  });

  describe('日期錯誤', () => {
    it('沒有日期', () => {
      const s = sheet('s', [[null, null], ['東京']]);
      expect(parseScheduleSheet(s).issues).toEqual([
        { severity: 'error', code: 'noDates', sheet: 's', cell: 'A1' },
      ]);
    });

    it('不是日期、重複、沒有遞增', () => {
      const s = sheet('s', [
        [d('2027-03-05'), null, '3/6', null, d('2027-03-05'), null, d('2027-03-04')],
      ]);
      const codes = parseScheduleSheet(s).issues.map((issue) => [issue.code, issue.cell]);
      expect(codes).toEqual([
        ['invalidDate', 'C1'],
        ['duplicateDate', 'E1'],
        ['datesNotAscending', 'G1'],
      ]);
    });

    it('超過 60 天', () => {
      const s = sheet('s', [[d('2027-03-01'), null, d('2027-04-30')]]);
      expect(parseScheduleSheet(s).issues).toContainEqual(
        expect.objectContaining({ code: 'tooManyDays', cell: 'C1', params: { max: 60 } }),
      );
      const ok = sheet('s', [[d('2027-03-01'), null, d('2027-04-29')]]);
      expect(parseScheduleSheet(ok).issues).toEqual([]);
    });

    it('中間跳過的日期不算錯誤', () => {
      const s = sheet('s', [[d('2027-03-05'), null, d('2027-03-08')]]);
      expect(parseScheduleSheet(s).issues).toEqual([]);
    });
  });
});
