import { describe, expect, it } from 'vitest';
import { isAlternativeGroup, MAX_PLACE_QUERIES, splitPlaceQueries } from '@/lib/maps/place-queries';

const texts = (title: string) => splitPlaceQueries(title).map((query) => query.text);

describe('splitPlaceQueries', () => {
  it('依「、，/→」拆開並去掉空白', () => {
    expect(texts('淺草寺、仲見世通 → 晴空塔')).toEqual(['淺草寺', '仲見世通', '晴空塔']);
    expect(texts('上野公園，阿美橫町／御徒町')).toEqual(['上野公園', '阿美橫町', '御徒町']);
    expect(texts('銀座, 築地->豐洲')).toEqual(['銀座', '築地', '豐洲']);
  });

  it('「或」連接的是二選一', () => {
    const queries = splitPlaceQueries('藏王纜車或銀山溫泉、山寺');
    expect(queries).toEqual([
      { text: '藏王纜車', group: 0 },
      { text: '銀山溫泉', group: 0 },
      { text: '山寺', group: 1 },
    ]);
    expect(isAlternativeGroup(queries, 0)).toBe(true);
    expect(isAlternativeGroup(queries, 1)).toBe(false);
  });

  it('沒有分隔符號時整個標題是一段', () => {
    expect(texts('東京車站')).toEqual(['東京車站']);
  });

  it('略過空白與重複的段落，最多搜尋幾段', () => {
    expect(texts('、淺草寺、、淺草寺 ')).toEqual(['淺草寺']);
    expect(texts('a、b、c、d、e、f、g、h')).toHaveLength(MAX_PLACE_QUERIES);
  });
});
