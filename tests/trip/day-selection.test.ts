import { describe, expect, it } from 'vitest';
import { resolveSelectedDayIndex } from '@/lib/trip/day-selection';

describe('resolveSelectedDayIndex', () => {
  it('網址指定的天數優先（從 1 起算）', () => {
    expect(resolveSelectedDayIndex('3', 10, 5)).toBe(2);
    expect(resolveSelectedDayIndex('10', 10, -1)).toBe(9);
  });

  it('沒有指定時，進行中顯示今天、其他顯示第 1 天', () => {
    expect(resolveSelectedDayIndex(undefined, 10, 4)).toBe(4);
    expect(resolveSelectedDayIndex(undefined, 10, -1)).toBe(0);
  });

  it.each(['0', '11', '-1', '2.5', 'abc', ''])('不合法的 %j 視同沒有指定', (param) => {
    expect(resolveSelectedDayIndex(param, 10, 4)).toBe(4);
  });

  it('沒有天數時回傳 0', () => {
    expect(resolveSelectedDayIndex(undefined, 0, -1)).toBe(0);
  });
});
