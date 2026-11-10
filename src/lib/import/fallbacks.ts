import { normalizeTitle } from './schedule-cells';
import type { DraftFallback } from './types';

// 備案用「日期＋項目標題」找要掛的項目（ADR 0008 Q7、Q16）。
// candidates 依優先順序排列：先放檔案裡的項目，附加模式再接行程裡的既有項目；
// 同一天有同名的項目時取第一個。回傳 fallback key → 對到的項目，對不到的是 null。
export function matchFallbacks<T extends { date: string; title: string }>(
  fallbacks: readonly DraftFallback[],
  candidates: readonly T[],
): Map<string, T | null> {
  const index = new Map<string, T>();
  for (const candidate of candidates) {
    const id = `${candidate.date}|${normalizeTitle(candidate.title)}`;
    if (!index.has(id)) index.set(id, candidate);
  }
  return new Map(
    fallbacks.map((fallback) => [
      fallback.key,
      index.get(`${fallback.date}|${normalizeTitle(fallback.itemTitle)}`) ?? null,
    ]),
  );
}
