import { describe, expect, it } from 'vitest';
import {
  autocompleteRequest,
  routeRequest,
  SEARCH_BIAS_RADIUS_METERS,
  toPlaceDetails,
  toPlaceAddress,
  toPlaceLocation,
  toPlaceSuggestions,
  toRouteResult,
} from '@/lib/maps/google-response';

describe('autocompleteRequest', () => {
  it('有座標時偏向座標附近，並帶時區推測的國家', () => {
    expect(
      autocompleteRequest({
        query: '淺草寺',
        sessionToken: 'token',
        bias: { center: { lat: 35.71, lng: 139.79 }, regionCode: 'JP' },
      }),
    ).toEqual({
      input: '淺草寺',
      sessionToken: 'token',
      languageCode: 'zh-TW',
      regionCode: 'JP',
      locationBias: {
        circle: {
          center: { latitude: 35.71, longitude: 139.79 },
          radius: SEARCH_BIAS_RADIUS_METERS,
        },
      },
    });
  });

  it('沒有座標與國家時不帶偏向', () => {
    expect(
      autocompleteRequest({
        query: 'x',
        sessionToken: 't',
        bias: { center: null, regionCode: null },
      }),
    ).toEqual({ input: 'x', sessionToken: 't', languageCode: 'zh-TW' });
  });
});

describe('routeRequest', () => {
  it('步行不帶 routingPreference，開車不考慮即時路況', () => {
    expect(routeRequest('a', 'b', 'walk')).toEqual({
      origin: { placeId: 'a' },
      destination: { placeId: 'b' },
      travelMode: 'WALK',
      languageCode: 'zh-TW',
    });
    expect(routeRequest('a', 'b', 'drive')).toMatchObject({
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    });
  });
});

describe('toPlaceSuggestions', () => {
  it('取地點建議，略過查詢建議', () => {
    expect(
      toPlaceSuggestions({
        suggestions: [
          {
            placePrediction: {
              placeId: 'p1',
              text: { text: '淺草寺, 台東區' },
              structuredFormat: { mainText: { text: '淺草寺' }, secondaryText: { text: '台東區' } },
            },
          },
          { queryPrediction: { text: { text: '淺草 美食' } } },
          { placePrediction: { placeId: 'p2', text: { text: '雷門' } } },
        ],
      }),
    ).toEqual([
      { placeId: 'p1', mainText: '淺草寺', secondaryText: '台東區' },
      { placeId: 'p2', mainText: '雷門', secondaryText: null },
    ]);
  });

  it('沒有結果或格式不符時是空陣列', () => {
    expect(toPlaceSuggestions({})).toEqual([]);
    expect(toPlaceSuggestions({ suggestions: 'x' })).toEqual([]);
  });
});

describe('toPlaceDetails', () => {
  it('轉換地址、座標、營業狀態與營業時間', () => {
    expect(
      toPlaceDetails({
        id: 'p1',
        formattedAddress: '東京都台東區淺草 2-3-1',
        location: { latitude: 35.7111, longitude: 139.7963 },
        businessStatus: 'OPERATIONAL',
        regularOpeningHours: {
          openNow: true,
          periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
          weekdayDescriptions: [],
        },
        currentOpeningHours: {
          periods: [
            {
              open: {
                day: 3,
                hour: 0,
                minute: 0,
                truncated: true,
                date: { year: 2026, month: 11, day: 11 },
              },
              close: {
                day: 2,
                hour: 23,
                minute: 59,
                truncated: true,
                date: { year: 2026, month: 11, day: 17 },
              },
            },
          ],
        },
      }),
    ).toEqual({
      placeId: 'p1',
      address: '東京都台東區淺草 2-3-1',
      location: { lat: 35.7111, lng: 139.7963 },
      businessStatus: 'operational',
      regularHours: {
        periods: [{ open: { day: 0, hour: 0, minute: 0, date: null }, close: null }],
      },
      currentHours: {
        periods: [
          {
            open: { day: 3, hour: 0, minute: 0, date: '2026-11-11' },
            close: { day: 2, hour: 23, minute: 59, date: '2026-11-17' },
          },
        ],
      },
    });
  });

  it('缺少的欄位是 null，不認得的營業狀態也是 null', () => {
    expect(toPlaceDetails({ id: 'p1', businessStatus: 'SOMETHING_NEW' })).toEqual({
      placeId: 'p1',
      address: null,
      location: null,
      businessStatus: null,
      regularHours: null,
      currentHours: null,
    });
    expect(toPlaceDetails({})).toBeNull();
  });

  it('toPlaceLocation 只取座標', () => {
    expect(toPlaceLocation({ id: 'p1', location: { latitude: 1, longitude: 2 } })).toEqual({
      lat: 1,
      lng: 2,
    });
    expect(toPlaceLocation({ id: 'p1' })).toBeNull();
  });

  it('toPlaceAddress 只取地址', () => {
    expect(toPlaceAddress({ id: 'p1', formattedAddress: '日本宮城縣仙台市青葉區' })).toBe(
      '日本宮城縣仙台市青葉區',
    );
    expect(toPlaceAddress({ id: 'p1', formattedAddress: '' })).toBeNull();
    expect(toPlaceAddress({ id: 'p1' })).toBeNull();
  });
});

describe('toRouteResult', () => {
  it('取第一條路線的時間與距離', () => {
    expect(toRouteResult({ routes: [{ duration: '1495s', distanceMeters: 1713 }] })).toEqual({
      durationSeconds: 1495,
      distanceMeters: 1713,
    });
  });

  it('算不出路線時是 null（例如日本的大眾運輸回傳 {}）', () => {
    expect(toRouteResult({})).toBeNull();
    expect(toRouteResult({ routes: [] })).toBeNull();
    expect(toRouteResult({ routes: [{ duration: 'abc' }] })).toBeNull();
  });
});
