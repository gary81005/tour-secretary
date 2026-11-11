// 「幫我找地點」（ADR 0006 Q12）：把項目標題拆成幾段，各自搜尋。
// 例如「淺草寺、仲見世通→晴空塔」拆成三段；「藏王纜車或銀山溫泉」的兩段是二選一（同一個 group）。

export type PlaceQuery = {
  text: string;
  // 用「或」連接的幾段 group 相同，畫面提示「二選一」。
  group: number;
};

// 一次最多搜尋幾段：每段是一次 Autocomplete 請求。
export const MAX_PLACE_QUERIES = 6;

const SEPARATORS = /[、，,／/→]|->/;
const ALTERNATIVE = '或';

export function splitPlaceQueries(title: string): PlaceQuery[] {
  const seen = new Set<string>();
  const queries: PlaceQuery[] = [];

  title.split(SEPARATORS).forEach((part, group) => {
    part.split(ALTERNATIVE).forEach((piece) => {
      const text = piece.trim();
      if (text === '' || seen.has(text)) return;
      seen.add(text);
      queries.push({ text, group });
    });
  });

  return queries.slice(0, MAX_PLACE_QUERIES);
}

// 同一個 group 有兩段以上才是二選一。
export function isAlternativeGroup(queries: readonly PlaceQuery[], group: number): boolean {
  return queries.filter((query) => query.group === group).length > 1;
}
