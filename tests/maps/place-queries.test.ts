import { describe, expect, it } from 'vitest';
import {
  isAlternativeGroup,
  MAX_PLACE_QUERIES,
  mergeFoundPlaces,
  placeFinderQueries,
  splitPlaceQueries,
} from '@/lib/maps/place-queries';

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

describe('placeFinderQueries', () => {
  const texts = (title: string, places: { name: string; placeId: string | null }[]) =>
    placeFinderQueries(title, places).map((query) => query.text);

  it('先搜尋還沒連結的地點，再搜尋標題的各段', () => {
    expect(texts('淺草寺、晴空塔', [{ name: '雷門', placeId: null }])).toEqual([
      '雷門',
      '淺草寺',
      '晴空塔',
    ]);
  });

  it('和已連結地點同名、或和沒連結的地點重複的段落只搜一次', () => {
    expect(
      texts('淺草寺、晴空塔', [
        { name: '淺草寺', placeId: 'ChIJ1' },
        { name: ' 晴空塔 ', placeId: null },
      ]),
    ).toEqual(['晴空塔']);
  });

  it('二選一的 group 不會和地點列的 group 混在一起', () => {
    const queries = placeFinderQueries('藏王纜車或銀山溫泉', [{ name: '山寺', placeId: null }]);
    expect(queries).toEqual([
      { text: '山寺', group: 0 },
      { text: '藏王纜車', group: 1 },
      { text: '銀山溫泉', group: 1 },
    ]);
    expect(isAlternativeGroup(queries, 1)).toBe(true);
  });

  it('沒有標題也沒有地點時是空的', () => {
    expect(texts('  ', [{ name: '', placeId: null }])).toEqual([]);
  });
});

describe('mergeFoundPlaces', () => {
  type Row = { key: string; name: string; placeId: string | null; sessionToken: string };
  let next = 0;
  const newRow = (place: Omit<Row, 'key'>): Row => ({ key: `new-${next++}`, ...place });
  const found = (query: string, placeId: string, name = query) => ({
    query,
    placeId,
    name,
    sessionToken: `token-${placeId}`,
  });

  it('連結同名的純文字地點，保留使用者寫的名稱與位置', () => {
    const rows: Row[] = [
      { key: 'a', name: '晴空塔', placeId: null, sessionToken: '' },
      { key: 'b', name: '午餐', placeId: null, sessionToken: '' },
    ];
    expect(mergeFoundPlaces(rows, [found('晴空塔', 'ChIJ1', '東京晴空塔')], newRow)).toEqual([
      { key: 'a', name: '晴空塔', placeId: 'ChIJ1', sessionToken: 'token-ChIJ1' },
      rows[1],
    ]);
  });

  it('其他段落加在最後，名稱用 Google 的名稱', () => {
    next = 0;
    const merged = mergeFoundPlaces([], [found('淺草', 'ChIJ2', '淺草寺')], newRow);
    expect(merged).toEqual([
      { key: 'new-0', name: '淺草寺', placeId: 'ChIJ2', sessionToken: 'token-ChIJ2' },
    ]);
  });

  it('已經在列表裡的地點不重複加入', () => {
    const rows: Row[] = [{ key: 'a', name: '淺草寺', placeId: 'ChIJ2', sessionToken: '' }];
    expect(
      mergeFoundPlaces(rows, [found('淺草', 'ChIJ2'), found('雷門', 'ChIJ2')], newRow),
    ).toEqual(rows);
  });
});
