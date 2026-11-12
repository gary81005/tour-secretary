import 'server-only';
import type { PlaceAddresses } from '@/components/maps/google-address';
import type { PlaceSearchContext } from '@/components/maps/place-search-input';
import { getItemPlaceHours, getPlaceAddresses } from '@/data/places';
import { getDayTravel } from '@/data/routes';
import type { DayItem, TripStay } from '@/data/trips';
import { getMapsApiKey } from '@/lib/maps/env';
import { dayStayStops, type DayTravel, type LegStop } from '@/lib/maps/legs';
import { dayRoutePlaces, googleDayRouteUrl } from '@/lib/maps/links';
import { routesSupported } from '@/lib/maps/region';
import { searchBias } from '@/lib/maps/search-bias';
import { sortItems } from '@/lib/trip/item-order';
import { localDate } from '@/lib/trip/trip-phase';
import type { ItemPlaceHours } from './item-card';

export type DayMaps = {
  placeSearch: PlaceSearchContext | null;
  placeHours: ItemPlaceHours | null;
  routeUrl: string | null;
  travel: DayTravel;
  addresses: PlaceAddresses | null;
  // 營業時間、地址或移動時間可能來自 Google 時標示來源（服務條款）。
  googleAttribution: boolean;
};

// 單日畫面的地圖資料（ADR 0006）。向 Google 查的部分（營業時間、移動時間、地址）都不 await，
// 讓頁面先顯示，查到後再串流到畫面上。
// 沒有地圖金鑰時地點只能輸入文字，也不顯示營業時間、移動時間與 Google 的地址（Q15）。
export function getDayMaps(input: {
  items: readonly DayItem[];
  stays: readonly TripStay[];
  // 當晚的住宿（「今晚住」顯示的那些）；最後一天（回程日）是空陣列
  tonightStays: readonly TripStay[];
  date: string;
  timezone: string;
  isLastDay: boolean;
  now: Date;
}): DayMaps {
  const { items, stays, date, timezone, now } = input;
  const mapsEnabled = getMapsApiKey() !== null;

  // 搜尋偏向當天已連結的地點，其次是前一晚（退房日＝當天）與當晚的住宿。
  const placeSearch: PlaceSearchContext | null = mapsEnabled
    ? {
        bias: searchBias({
          places: items.flatMap((item) => item.item_places),
          stays: stays.filter((stay) => stay.check_in <= date && date <= stay.check_out),
          timezone,
          now,
        }),
      }
    : null;

  const placeHours: ItemPlaceHours | null = mapsEnabled
    ? getItemPlaceHours(items, date, localDate(timezone, now))
    : null;

  // 一天的頭尾：前一晚與當晚的住宿。最後一天不回住宿。
  const stops = dayStayStops(
    stays.map((stay) => ({
      ...stay,
      place: stay.place_id ? { placeId: stay.place_id, name: stay.name } : null,
    })),
    date,
  );
  const startStay = stops.startStay;
  const endStay = input.isLastDay ? null : stops.endStay;

  // 當天路線（Q3）：前一晚的住宿 → 各項目的地點 → 當晚的住宿。Google 在韓國沒有路線（Q13）。
  const routeUrl = routesSupported(timezone)
    ? googleDayRouteUrl(
        dayRoutePlaces({
          items: sortItems(items).map((item) => ({
            places: item.item_places.map((place) => ({
              name: place.name,
              placeId: place.place_id,
            })),
          })),
          startStay: stayPlace(startStay),
          endStay: stayPlace(endStay),
        }),
      )
    : null;

  // 卡片之間的移動時間（Q9）。
  const travel = getDayTravel({ items, stays, startStay, endStay, timezone, mapsEnabled, now });

  // 住宿沒寫地址時顯示 Google 的地址（「地點連結」）。
  const unaddressed = input.tonightStays.flatMap((stay) =>
    stay.place_id && !stay.address ? [stay.place_id] : [],
  );
  const addresses =
    mapsEnabled && unaddressed.length > 0 ? getPlaceAddresses(unaddressed, timezone) : null;

  return {
    placeSearch,
    placeHours,
    routeUrl,
    travel,
    addresses,
    googleAttribution:
      (placeHours !== null && items.some((item) => item.item_places.some((p) => p.place_id))) ||
      addresses !== null ||
      (travel.routes.kind === 'google' && travel.routes.durations !== null),
  };
}

function stayPlace(stop: LegStop | null) {
  return stop && { name: stop.place.name, placeId: stop.place.placeId };
}
