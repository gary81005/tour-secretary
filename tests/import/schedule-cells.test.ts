import { describe, expect, it } from 'vitest';
import {
  inferCategory,
  normalizeTitle,
  parseTimeCell,
  splitContent,
} from '@/lib/import/schedule-cells';

describe('parseTimeCell', () => {
  it.each([
    ['整天', 'all_day'],
    ['清晨', 'early_morning'],
    ['上午', 'morning'],
    ['中午', 'noon'],
    ['下午', 'afternoon'],
    ['傍晚', 'evening'],
    ['晚上', 'night'],
  ])('時段名稱 %s', (text, slot) => {
    expect(parseTimeCell(text)).toMatchObject({
      timeSlot: slot,
      recognized: true,
      startTime: null,
    });
  });

  it.each([
    ['17:00', '17:00', null, 'evening'],
    ['約17:00', '17:00', null, 'evening'],
    ['17:00左右', '17:00', null, 'evening'],
    ['9:05', '09:05', null, 'morning'],
    ['１７：００', '17:00', null, 'evening'],
    ['13:30–14:00', '13:30', '14:00', 'noon'],
    ['13:30 - 14:00', '13:30', '14:00', 'noon'],
    ['13:30～14:00', '13:30', '14:00', 'noon'],
  ])('時間 %s', (text, startTime, endTime, slot) => {
    expect(parseTimeCell(text)).toMatchObject({
      startTime,
      endTime,
      timeSlot: slot,
      recognized: true,
      endTimeDropped: false,
    });
  });

  it('結束時間不晚於開始時間時只保留開始時間', () => {
    expect(parseTimeCell('23:00-01:00')).toMatchObject({
      startTime: '23:00',
      endTime: null,
      endTimeDropped: true,
    });
  });

  it.each([
    ['早上', 'morning', null],
    ['早餐', 'early_morning', 'meal'],
    ['午餐', 'noon', 'meal'],
    ['晚餐', 'night', 'meal'],
    ['夜晚', 'night', null],
    ['住宿', 'night', 'lodging'],
    ['提醒', 'all_day', 'reminder'],
  ])('同義詞 %s', (text, slot, category) => {
    expect(parseTimeCell(text)).toMatchObject({ timeSlot: slot, category, recognized: true });
  });

  it('「A／B」取第一個', () => {
    expect(parseTimeCell('傍晚／晚上')).toMatchObject({ timeSlot: 'evening', recognized: true });
    expect(parseTimeCell('上午/中午')).toMatchObject({ timeSlot: 'morning', recognized: true });
  });

  it.each(['', '  ', '隨時', '25:00', '午後'])('認不出來的 %j 歸到整天', (text) => {
    expect(parseTimeCell(text)).toMatchObject({ timeSlot: 'all_day', recognized: false });
  });
});

describe('inferCategory', () => {
  it.each([
    ['JR 前往松島海岸', 'transport'],
    ['搭乘東北新幹線前往仙台', 'transport'],
    ['淺草午餐', 'meal'],
    ['山形牛／當地料理', 'meal'],
    ['東京退房', 'lodging'],
    ['飯店 Check-in', 'lodging'],
    ['市區購物', 'shopping'],
    ['採買伴手禮', 'shopping'],
  ])('%s → %s', (title, category) => {
    expect(inferCategory(title, null)).toBe(category);
  });

  it('依序比對，先符合的優先', () => {
    expect(inferCategory('提早用午餐後前往仙台機場', null)).toBe('transport');
  });

  it('標題沒有線索才看說明', () => {
    expect(inferCategory('東京退房', '搭乘東北新幹線')).toBe('lodging');
    expect(inferCategory('藏王溫泉', '搭巴士上山')).toBe('transport');
  });

  it('沒有線索回傳 null', () => {
    expect(inferCategory('淺草寺、仲見世通', null)).toBeNull();
  });
});

describe('splitContent', () => {
  it('第一行是標題，其餘是說明', () => {
    expect(splitContent('東京退房；\n搭乘東北新幹線前往仙台，\n抵達後先寄放行李')).toEqual({
      title: '東京退房',
      description: '搭乘東北新幹線前往仙台，\n抵達後先寄放行李',
      truncated: false,
    });
  });

  it('只有一行時沒有說明', () => {
    expect(splitContent('  淺草寺、仲見世通 ')).toEqual({
      title: '淺草寺、仲見世通',
      description: null,
      truncated: false,
    });
  });

  it('略過空白行', () => {
    expect(splitContent('\n\n淺草寺\n\n仲見世通\n')?.description).toBe('仲見世通');
  });

  it('標題超過 200 字時截斷，全文放進說明', () => {
    const long = '景'.repeat(250);
    const result = splitContent(`${long}\n第二行`);
    expect(result?.title).toHaveLength(200);
    expect(result?.description).toBe(`${long}\n第二行`);
    expect(result?.truncated).toBe(true);
  });

  it('空白內容回傳 null', () => {
    expect(splitContent(' \n ')).toBeNull();
  });
});

describe('normalizeTitle', () => {
  it('忽略空白、全形半形與結尾標點', () => {
    expect(normalizeTitle(' 藏王纜車／樹冰； ')).toBe(normalizeTitle('藏王纜車/樹冰'));
    expect(normalizeTitle('Ａ  B')).toBe('A B');
  });
});
