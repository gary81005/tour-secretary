// 「幫我找地點」（ADR 0006「地點連結」）：把項目標題拆成幾段，各自搜尋。
// 例如「淺草寺、仲見世通→晴空塔」拆成三段；「藏王纜車或銀山溫泉」的兩段是二選一（同一個 group）。

export type PlaceQuery = {
  text: string;
  // 用「或」連接的幾段 group 相同，畫面提示「二選一」。
  group: number;
};

// 一次最多搜尋幾段：每段是一次 Autocomplete 請求。
export const MAX_PLACE_QUERIES = 6;

// 每段列出幾個候選。
export const PLACE_CANDIDATES = 3;

const SEPARATORS = /[、，,／/→]|->/;
const ALTERNATIVE = '或';

// 標題的各段；每段是一組二選一的名稱（沒有「或」時只有一個）。
function titleSegments(title: string): string[][] {
  return title.split(SEPARATORS).map((part) => part.split(ALTERNATIVE));
}

// 去掉空白、重複與 exclude 裡的名稱，最多 MAX_PLACE_QUERIES 段。group 是段落的順序。
function toQueries(segments: readonly string[][], exclude: readonly string[]): PlaceQuery[] {
  const seen = new Set(exclude);
  const queries: PlaceQuery[] = [];

  segments.forEach((pieces, group) => {
    pieces.forEach((piece) => {
      const text = piece.trim();
      if (text === '' || seen.has(text)) return;
      seen.add(text);
      queries.push({ text, group });
    });
  });

  return queries.slice(0, MAX_PLACE_QUERIES);
}

export function splitPlaceQueries(title: string): PlaceQuery[] {
  return toQueries(titleSegments(title), []);
}

// 「幫我找地點」實際搜尋的段落：先是還沒連結的地點（例如 M2 匯入的純文字），再是標題拆開的各段。
// 名稱和已連結地點相同的段落跳過。
export function placeFinderQueries(
  title: string,
  places: readonly { name: string; placeId: string | null }[],
): PlaceQuery[] {
  const linked = places.filter((place) => place.placeId).map((place) => place.name.trim());
  const unlinked = places.filter((place) => !place.placeId).map((place) => [place.name]);
  return toQueries([...unlinked, ...titleSegments(title)], linked);
}

// 同一個 group 有兩段以上才是二選一。
export function isAlternativeGroup(queries: readonly PlaceQuery[], group: number): boolean {
  return queries.filter((query) => query.group === group).length > 1;
}

export type FoundPlace = {
  // 搜尋的段落文字
  query: string;
  placeId: string;
  // Google 的名稱
  name: string;
  sessionToken: string;
};

type PlaceRowLike = { key: string; name: string; placeId: string | null; sessionToken: string };

// 把勾選的候選併進地點列：段落來自還沒連結的地點時，連結那一列並保留使用者寫的名稱；
// 其餘加在最後，名稱用 Google 的名稱。已經在列表裡的地點不重複加入。
export function mergeFoundPlaces<Row extends PlaceRowLike>(
  rows: readonly Row[],
  found: readonly FoundPlace[],
  newRow: (place: Omit<PlaceRowLike, 'key'>) => Row,
): Row[] {
  return found.reduce<Row[]>(
    (next, place) => {
      if (next.some((row) => row.placeId === place.placeId)) return next;
      const link = { placeId: place.placeId, sessionToken: place.sessionToken };
      const index = next.findIndex((row) => !row.placeId && row.name.trim() === place.query);
      if (index >= 0) return next.map((row, i) => (i === index ? { ...row, ...link } : row));
      return [...next, newRow({ name: place.name, ...link })];
    },
    [...rows],
  );
}
