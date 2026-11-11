import dayjs from '@/lib/dayjs';
import type { LatLng } from './types';

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
