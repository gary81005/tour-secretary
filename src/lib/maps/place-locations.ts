import dayjs from '@/lib/dayjs';
import type { LatLng, MapProviderName } from './types';

// 地點 ID 與座標的純邏輯（ADR 0006 Q14）。存檔時瀏覽器只送地點 ID，座標由伺服器向地圖服務查
// （locate-places.ts）；地點沒變、座標還在 30 天內時沿用原本的座標與抓取時間，不重查。

// Google Maps Platform 服務條款：座標最多快取 30 天（ADR 0006 Q14）。
// 過期的座標當作沒有：搜尋不再偏向它，下次存檔該項目或住宿時重新查。
export const LOCATION_MAX_AGE_DAYS = 30;

export function freshLocation(
  place: { lat: number | null; lng: number | null; location_fetched_at: string | null },
  now: Date,
): LatLng | null {
  if (place.lat === null || place.lng === null || place.location_fetched_at === null) return null;
  const expired = dayjs
    .utc(place.location_fetched_at)
    .add(LOCATION_MAX_AGE_DAYS, 'day')
    .isBefore(now);
  return expired ? null : { lat: place.lat, lng: place.lng };
}

// Google 的地點 ID 只有英數、底線、連字號。放進 URL 路徑前先檢查，也用在 Server Action 的驗證。
export function isPlaceId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,300}$/.test(value);
}

// ---------------------------------------------------------------------------
// 存檔時的地點連結
// ---------------------------------------------------------------------------

export type PlaceInput = { name: string; placeId: string | null };

export type StoredLocation = LatLng & { fetchedAt: string };

// save_item 的 p_places 元素（supabase/migrations/20261111000001_place_links.sql）。
export type SavedPlace = {
  name: string;
  provider: MapProviderName | null;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  location_fetched_at: string | null;
};

// 既有地點裡還能沿用的座標，以地點 ID 對應。
export function reusableLocations(
  rows: readonly {
    place_id: string | null;
    lat: number | null;
    lng: number | null;
    location_fetched_at: string | null;
  }[],
  now: Date,
): Map<string, StoredLocation> {
  const locations = new Map<string, StoredLocation>();
  rows.forEach((row) => {
    const location = freshLocation(row, now);
    if (row.place_id && location && row.location_fetched_at) {
      locations.set(row.place_id, { ...location, fetchedAt: row.location_fetched_at });
    }
  });
  return locations;
}

// 還需要向地圖服務查座標的地點 ID（不重複）。
export function placeIdsToLocate(
  places: readonly PlaceInput[],
  known: ReadonlyMap<string, StoredLocation>,
): string[] {
  const ids = places.flatMap((place) =>
    place.placeId && !known.has(place.placeId) ? [place.placeId] : [],
  );
  return [...new Set(ids)];
}

// 查不到座標的地點仍保留連結（只是沒有座標），之後存檔時再查。
export function toSavedPlaces(
  places: readonly PlaceInput[],
  locations: ReadonlyMap<string, StoredLocation>,
): SavedPlace[] {
  return places.map(({ name, placeId }) => {
    const location = placeId ? locations.get(placeId) : undefined;
    return {
      name,
      provider: placeId ? 'google' : null,
      place_id: placeId,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      location_fetched_at: location?.fetchedAt ?? null,
    };
  });
}
