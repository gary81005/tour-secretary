import { freshLocation } from './location';
import { regionCodeForTimezone } from './region';
import type { SearchBias } from './types';

type Located = { lat: number | null; lng: number | null; location_fetched_at: string | null };

// 地點搜尋偏向（ADR 0006 Q10）：先找當天已連結的地點，再找前一晚／當晚的住宿；
// 都沒有（或座標超過 30 天）時只帶由時區推測的國家。
export function searchBias(input: {
  places: readonly Located[];
  stays: readonly Located[];
  timezone: string;
  now: Date;
}): SearchBias {
  const center =
    [...input.places, ...input.stays]
      .map((place) => freshLocation(place, input.now))
      .find((location) => location !== null) ?? null;
  return { center, regionCode: regionCodeForTimezone(input.timezone) };
}
