import { describe, expect, it } from 'vitest';
import {
  cellAddress,
  cellText,
  cellUrl,
  columnLetters,
  mergedValue,
  parseDateCell,
  parseRange,
  timeCellText,
  toHalfWidth,
} from '@/lib/import/cells';
import { d, sheet } from './helpers';

describe('儲存格位置', () => {
  it('欄號轉英文字母', () => {
    expect(columnLetters(0)).toBe('A');
    expect(columnLetters(25)).toBe('Z');
    expect(columnLetters(26)).toBe('AA');
    expect(columnLetters(701)).toBe('ZZ');
    expect(cellAddress(2, 3)).toBe('D3');
  });

  it('解析合併範圍', () => {
    expect(parseRange('A2:F2')).toEqual({ top: 1, left: 0, bottom: 1, right: 5 });
    expect(parseRange('c15')).toEqual({ top: 14, left: 2, bottom: 14, right: 2 });
    expect(parseRange('not a range')).toBeNull();
  });

  it('合併儲存格內任一格都取左上角的值', () => {
    const s = sheet('s', [[null], ['東京', null, null, null, null, null, '仙台']], ['A2:F2']);
    expect(mergedValue(s, 1, 4)).toBe('東京');
    expect(mergedValue(s, 1, 6)).toBe('仙台');
    expect(mergedValue(s, 1, 7)).toBeNull();
  });
});

describe('cellText', () => {
  it('各種值轉成文字', () => {
    expect(cellText('  淺草寺 ')).toBe('淺草寺');
    expect(cellText(3)).toBe('3');
    expect(cellText(null)).toBe('');
    expect(cellText(d('2027-03-05'))).toBe('2027-03-05');
    expect(cellText({ text: '官網', hyperlink: 'https://example.com' })).toBe('官網');
  });

  it('只有時間的儲存格顯示 HH:MM', () => {
    expect(cellText(new Date(Date.UTC(1899, 11, 30, 17, 0)))).toBe('17:00');
    // 浮點誤差：16:59:59.999 仍是 17:00
    expect(cellText(new Date(Date.UTC(1899, 11, 30, 17, 0) - 1))).toBe('17:00');
  });

  it('時段欄的數字時間值', () => {
    expect(timeCellText(0.75)).toBe('18:00');
    expect(timeCellText('上午')).toBe('上午');
  });

  it('連結欄優先取超連結網址', () => {
    expect(cellUrl({ text: '官網', hyperlink: 'https://example.com' })).toBe('https://example.com');
    expect(cellUrl('https://a.com')).toBe('https://a.com');
  });

  it('全形轉半形', () => {
    expect(toHalfWidth('１７：００～１８：００')).toBe('17:00~18:00');
  });
});

describe('parseDateCell', () => {
  it('日期值', () => {
    expect(parseDateCell(d('2027-03-05'))).toBe('2027-03-05');
  });

  it('Excel 日期序號', () => {
    expect(parseDateCell(46451)).toBe('2027-03-05');
    expect(parseDateCell(3)).toBeNull();
  });

  it.each([
    ['2027/3/5', '2027-03-05'],
    ['2027-03-05', '2027-03-05'],
    ['2027.3.5', '2027-03-05'],
    ['2027年3月5日', '2027-03-05'],
    ['2027/3/5（五）', '2027-03-05'],
    ['２０２７／３／５', '2027-03-05'],
  ])('文字 %s', (text, expected) => {
    expect(parseDateCell(text)).toBe(expected);
  });

  it.each(['3/5', '2027/2/30', '2027/13/1', '明天', ''])('不接受 %j', (text) => {
    expect(parseDateCell(text)).toBeNull();
  });

  it('只有時間的儲存格不是日期', () => {
    expect(parseDateCell(new Date(Date.UTC(1899, 11, 30, 17, 0)))).toBeNull();
  });
});
