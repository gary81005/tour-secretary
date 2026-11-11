import type { LatLng } from './types';

// 開啟外部地圖 App 的連結（ADR 0006 Q3、Q9、Q13）。Maps URL 不需要金鑰，沒有設定金鑰時也能用。
// https://developers.google.com/maps/documentation/urls/get-started

// 有連結的地點帶地點 ID；只有文字的地點用名稱搜尋。
export type PlaceRef = { name: string; placeId: string | null };

// Maps URL 的中途點上限；超過時只帶前幾個。
export const MAX_ROUTE_WAYPOINTS = 9;

export function googlePlaceUrl(place: PlaceRef): string {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', place.name);
  if (place.placeId) url.searchParams.set('query_place_id', place.placeId);
  return url.toString();
}

// 一段移動的「查電車」：交給 Google 地圖 App 用大眾運輸規劃（Routes API 在日本算不出電車）。
export function googleTransitUrl(from: PlaceRef, to: PlaceRef): string {
  const url = directionsUrl(from, to);
  url.searchParams.set('travelmode', 'transit');
  return url.toString();
}

// 「在 Google 地圖看今天的路線」：依序經過當天的地點。不指定交通方式（帶中途點時不支援大眾運輸），
// 用來看地點分布。少於兩個地點時回傳 null。
export function googleDayRouteUrl(places: readonly PlaceRef[]): string | null {
  if (places.length < 2) return null;
  const origin = places[0];
  const destination = places[places.length - 1];
  const waypoints = places.slice(1, -1).slice(0, MAX_ROUTE_WAYPOINTS);

  const url = directionsUrl(origin, destination);
  if (waypoints.length > 0) {
    url.searchParams.set('waypoints', waypoints.map((place) => place.name).join('|'));
    // 地點 ID 要和 waypoints 一一對應，所以全部都有連結時才帶。
    if (waypoints.every((place) => place.placeId)) {
      url.searchParams.set('waypoint_place_ids', waypoints.map((place) => place.placeId).join('|'));
    }
  }
  return url.toString();
}

function directionsUrl(from: PlaceRef, to: PlaceRef): URL {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', from.name);
  if (from.placeId) url.searchParams.set('origin_place_id', from.placeId);
  url.searchParams.set('destination', to.name);
  if (to.placeId) url.searchParams.set('destination_place_id', to.placeId);
  return url;
}

// 韓國：Google 沒有步行與開車路線，改用 Naver Map／KakaoMap（Q13）。
export function naverSearchUrl(name: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(name)}`;
}

export function kakaoSearchUrl(name: string): string {
  return `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
}

// KakaoMap 的路線連結需要座標（https://apis.map.kakao.com/web/guide/#routeurl）。
// 名稱裡的逗號與斜線會被當成分隔符號，先拿掉。
export function kakaoDirectionsUrl(
  from: { name: string; location: LatLng },
  to: { name: string; location: LatLng },
): string {
  const point = ({ name, location }: { name: string; location: LatLng }) =>
    `${encodeURIComponent(name.replace(/[,/]/g, ' ').trim())},${location.lat},${location.lng}`;
  return `https://map.kakao.com/link/from/${point(from)}/to/${point(to)}`;
}
