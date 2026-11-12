import 'server-only';
import { cacheLife } from 'next/cache';
import { getMapProvider } from '@/lib/maps/google';
import {
  legKey,
  needsDriving,
  planItemLegs,
  type DayTravel,
  type Leg,
  type LegDurations,
  type LegStop,
} from '@/lib/maps/legs';
import { freshLocation } from '@/lib/maps/location';
import { routesSupported } from '@/lib/maps/region';
import type { RouteResult, TravelMode } from '@/lib/maps/types';
import type { OrderableItem } from '@/lib/trip/item-order';

// 單日畫面的移動時間（ADR 0006 Q9）：打開某一天時計算當天各段，伺服器短暫快取
// （'use cache' 的預設 handler，各 Vercel 執行個體各自一份，不一定命中）。
// 某一段查不到或地圖服務出錯時略過那一段（畫面只顯示「查電車」），不讓頁面失敗。

const ROUTE_CACHE_LIFE = { stale: 300, revalidate: 3600, expire: 7200 };

async function cachedRoute(
  fromPlaceId: string,
  toPlaceId: string,
  mode: TravelMode,
): Promise<RouteResult | null> {
  'use cache';
  cacheLife(ROUTE_CACHE_LIFE);
  return (await getMapProvider()?.computeRoute(fromPlaceId, toPlaceId, mode)) ?? null;
}

type PlaceRow = {
  name: string;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  location_fetched_at: string | null;
};

// 準備單日畫面的移動資料。不 await 移動時間，讓頁面先顯示，查到後再串流到各段。
// endStay：最後一天（回程日）傳 null。
export function getDayTravel(input: {
  items: readonly (OrderableItem & { item_places: readonly PlaceRow[] })[];
  stays: readonly PlaceRow[];
  startStay: LegStop | null;
  endStay: LegStop | null;
  timezone: string;
  mapsEnabled: boolean;
  now: Date;
}): DayTravel {
  const stops = { startStay: input.startStay, endStay: input.endStay };

  if (!routesSupported(input.timezone)) {
    const places = [...input.items.flatMap((item) => item.item_places), ...input.stays];
    const locations = Object.fromEntries(
      places.flatMap((place) => {
        const location = place.place_id ? freshLocation(place, input.now) : null;
        return place.place_id && location ? [[place.place_id, location]] : [];
      }),
    );
    return { ...stops, routes: { kind: 'korea', locations } };
  }

  const legs = planItemLegs(input.items, stops);
  return {
    ...stops,
    routes: {
      kind: 'google',
      durations: input.mapsEnabled && legs.length > 0 ? getLegDurations(legs) : null,
    },
  };
}

// 先算步行；步行超過 30 分鐘（或算不出步行）才另外算開車。
async function getLegDurations(legs: readonly Leg[]): Promise<Record<string, LegDurations>> {
  const pairs = new Map(legs.map((leg) => [legKey(leg), leg]));
  const entries = await Promise.all(
    [...pairs].map(async ([key, leg]): Promise<[string, LegDurations][]> => {
      const from = leg.from.place.placeId;
      const to = leg.to.place.placeId;
      try {
        const walk = await cachedRoute(from, to, 'walk');
        const drive =
          !walk || needsDriving(walk.durationSeconds) ? await cachedRoute(from, to, 'drive') : null;
        if (!walk && !drive) return [];
        return [
          [
            key,
            {
              walkSeconds: walk?.durationSeconds ?? null,
              driveSeconds: drive?.durationSeconds ?? null,
            },
          ],
        ];
      } catch (error) {
        console.error('route lookup failed', error instanceof Error ? error.message : error);
        return [];
      }
    }),
  );
  return Object.fromEntries(entries.flat());
}
