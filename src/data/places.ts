import 'server-only';
import { cacheLife } from 'next/cache';
import { pairAddresses, type PlaceAddress } from '@/lib/maps/address';
import { getMapProvider } from '@/lib/maps/google';
import { GOOGLE_LANGUAGE } from '@/lib/maps/google-response';
import { placeHours, type PlaceHours } from '@/lib/maps/opening-hours';
import { localAddressLanguage } from '@/lib/maps/region';
import type { PlaceDetails } from '@/lib/maps/types';

// 顯示用的地點資訊（ADR 0006）：營業時間、地址不存資料庫，顯示時才向地圖服務查。
// 只在伺服器記憶體短暫快取（'use cache' 的預設 handler，各 Vercel 執行個體各自一份，不一定命中）。
// 查不到或地圖服務出錯時略過那個地點，不讓頁面失敗。呼叫端不 await，把 Promise 交給畫面串流顯示。

// 營業時間每天會變（特殊營業日），只快取 1 小時。
const PLACE_CACHE_LIFE = { stale: 300, revalidate: 3600, expire: 7200 };

async function cachedPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  'use cache';
  cacheLife(PLACE_CACHE_LIFE);
  return (await getMapProvider()?.getPlaceDetails(placeId)) ?? null;
}

async function cachedPlaceAddress(placeId: string, language: string): Promise<string | null> {
  'use cache';
  cacheLife(PLACE_CACHE_LIFE);
  return (await getMapProvider()?.getPlaceAddress(placeId, language)) ?? null;
}

// 各地點 ID 各查一次（不重複），回傳查得到的。
async function lookup<T>(
  placeIds: readonly string[],
  fetchOne: (placeId: string) => Promise<T | null>,
): Promise<Map<string, T>> {
  const entries = await Promise.all(
    [...new Set(placeIds)].map(async (placeId) => {
      try {
        return [placeId, await fetchOne(placeId)] as const;
      } catch (error) {
        console.error('place lookup failed', error instanceof Error ? error.message : error);
        return [placeId, null] as const;
      }
    }),
  );
  return new Map(entries.flatMap(([placeId, value]) => (value === null ? [] : [[placeId, value]])));
}

// 單日畫面的營業資訊，以 item_places.id 對應（標記與項目的時間有關，同一個地點在不同項目可能不同）。
// today 是當天時區的今天（YYYY-MM-DD）。
export async function getItemPlaceHours(
  items: readonly {
    start_time: string | null;
    item_places: readonly { id: string; place_id: string | null }[];
  }[],
  date: string,
  today: string,
): Promise<Record<string, PlaceHours>> {
  const places = items.flatMap((item) =>
    item.item_places.flatMap((place) =>
      place.place_id ? [{ id: place.id, placeId: place.place_id, item }] : [],
    ),
  );
  const details = await lookup(
    places.map((place) => place.placeId),
    cachedPlaceDetails,
  );
  return Object.fromEntries(
    places.flatMap(({ id, placeId, item }) => {
      const found = details.get(placeId);
      return found ? [[id, placeHours(found, { date, start_time: item.start_time }, today)]] : [];
    }),
  );
}

// 住宿沒寫地址時顯示的 Google 地址，以地點 ID 對應（ADR 0006「地點連結」）。
// timezone 決定國家：有當地語言（日本、韓國…）時預設顯示當地語言，並一起查好繁中版本供切換。
export async function getPlaceAddresses(
  placeIds: readonly string[],
  timezone: string,
): Promise<Record<string, PlaceAddress>> {
  const local = localAddressLanguage(timezone);
  const inLanguage = async (language: string) => ({
    language,
    addresses: await lookup(placeIds, (placeId) => cachedPlaceAddress(placeId, language)),
  });
  const [primary, alternate] = await Promise.all([
    inLanguage(local ?? GOOGLE_LANGUAGE),
    local ? inLanguage(GOOGLE_LANGUAGE) : null,
  ]);
  return pairAddresses([...new Set(placeIds)], primary, alternate);
}
