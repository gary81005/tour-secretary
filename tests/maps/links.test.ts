import { describe, expect, it } from 'vitest';
import {
  dayRoutePlaces,
  googleDayRouteUrl,
  googlePlaceUrl,
  googleTransitUrl,
  kakaoDirectionsUrl,
  kakaoSearchUrl,
  MAX_ROUTE_WAYPOINTS,
  naverSearchUrl,
} from '@/lib/maps/links';

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);
const linked = (name: string) => ({ name, placeId: `id-${name}` });

describe('googlePlaceUrl', () => {
  it('有連結時帶地點 ID，只有文字時用名稱搜尋', () => {
    expect(params(googlePlaceUrl(linked('淺草寺')))).toEqual({
      api: '1',
      query: '淺草寺',
      query_place_id: 'id-淺草寺',
    });
    expect(params(googlePlaceUrl({ name: '淺草寺', placeId: null }))).toEqual({
      api: '1',
      query: '淺草寺',
    });
  });
});

describe('googleTransitUrl', () => {
  it('用大眾運輸規劃一段移動', () => {
    expect(params(googleTransitUrl(linked('淺草寺'), linked('晴空塔')))).toEqual({
      api: '1',
      origin: '淺草寺',
      origin_place_id: 'id-淺草寺',
      destination: '晴空塔',
      destination_place_id: 'id-晴空塔',
      travelmode: 'transit',
    });
  });
});

describe('googleDayRouteUrl', () => {
  it('少於兩個地點時沒有路線', () => {
    expect(googleDayRouteUrl([linked('淺草寺')])).toBeNull();
  });

  it('中間的地點是中途點，不指定交通方式', () => {
    const url = params(googleDayRouteUrl(['A', 'B', 'C', 'D'].map(linked))!);
    expect(url.origin).toBe('A');
    expect(url.destination).toBe('D');
    expect(url.waypoints).toBe('B|C');
    expect(url.waypoint_place_ids).toBe('id-B|id-C');
    expect(url.travelmode).toBeUndefined();
  });

  it('中途點有未連結的地點時不帶中途點的地點 ID', () => {
    const url = params(
      googleDayRouteUrl([linked('A'), { name: 'B', placeId: null }, linked('C')])!,
    );
    expect(url.waypoints).toBe('B');
    expect(url.waypoint_place_ids).toBeUndefined();
  });

  it(`中途點最多 ${MAX_ROUTE_WAYPOINTS} 個`, () => {
    const names = Array.from({ length: 14 }, (_, index) => `P${index}`);
    const url = params(googleDayRouteUrl(names.map(linked))!);
    expect(url.waypoints.split('|')).toHaveLength(MAX_ROUTE_WAYPOINTS);
    expect(url.destination).toBe('P13');
  });
});

describe('韓國的地圖連結', () => {
  it('Naver Map／KakaoMap 用名稱搜尋', () => {
    expect(naverSearchUrl('경복궁')).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent('경복궁')}`,
    );
    expect(kakaoSearchUrl('경복궁')).toBe(
      `https://map.kakao.com/link/search/${encodeURIComponent('경복궁')}`,
    );
  });

  it('KakaoMap 路線用座標，名稱裡的逗號與斜線先拿掉', () => {
    expect(
      kakaoDirectionsUrl(
        { name: 'A,B', location: { lat: 37.5, lng: 127 } },
        { name: 'C/D', location: { lat: 37.6, lng: 127.1 } },
      ),
    ).toBe('https://map.kakao.com/link/from/A%20B,37.5,127/to/C%20D,37.6,127.1');
  });
});

describe('dayRoutePlaces', () => {
  const hotel = { name: '仙台飯店', placeId: 'hotel' };

  it('前一晚的住宿 → 各項目的地點 → 當晚的住宿', () => {
    expect(
      dayRoutePlaces({
        items: [
          { places: [{ name: '瑞鳳殿', placeId: 'a' }] },
          { places: [] },
          {
            places: [
              { name: '午餐', placeId: null },
              { name: '定禪寺通', placeId: 'b' },
            ],
          },
        ],
        startStay: hotel,
        endStay: hotel,
      }).map((place) => place.name),
    ).toEqual(['仙台飯店', '瑞鳳殿', '午餐', '定禪寺通', '仙台飯店']);
  });

  it('連續相同的地點只算一次', () => {
    expect(
      dayRoutePlaces({
        items: [{ places: [hotel] }, { places: [{ name: '朝市', placeId: null }] }],
        startStay: hotel,
        endStay: null,
      }).map((place) => place.name),
    ).toEqual(['仙台飯店', '朝市']);
  });
});
