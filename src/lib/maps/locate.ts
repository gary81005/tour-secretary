import 'server-only';
import { getMapProvider } from './google';
import { placeIdsToLocate, type PlaceInput, type StoredLocation } from './place-links';

export type PlaceToLocate = PlaceInput & { sessionToken: string | null };

// 存檔前補上連結地點的座標（ADR 0006 Q14）：known 裡已有（30 天內）的沿用，其餘向地圖服務查。
// 查不到（沒有金鑰、地點已失效、逾時）的不放進結果，呼叫端照樣保留連結，只是沒有座標。
export async function locatePlaces(
  places: readonly PlaceToLocate[],
  known: ReadonlyMap<string, StoredLocation>,
  now: Date,
): Promise<Map<string, StoredLocation>> {
  const locations = new Map(known);
  const provider = getMapProvider();
  const missing = placeIdsToLocate(places, locations);
  if (!provider || missing.length === 0) return locations;

  const located = await Promise.all(
    missing.map(async (placeId) => {
      // 帶上選定這個地點時的 session token，結束那次搜尋 session。
      const sessionToken = places.find((place) => place.placeId === placeId)?.sessionToken;
      try {
        return [
          placeId,
          await provider.getPlaceLocation(placeId, sessionToken ?? undefined),
        ] as const;
      } catch (error) {
        console.error('getPlaceLocation failed', error instanceof Error ? error.message : error);
        return [placeId, null] as const;
      }
    }),
  );
  located.forEach(([placeId, location]) => {
    if (location) locations.set(placeId, { ...location, fetchedAt: now.toISOString() });
  });
  return locations;
}
