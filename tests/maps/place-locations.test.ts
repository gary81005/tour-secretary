import { describe, expect, it } from 'vitest';
import {
  freshLocation,
  isPlaceId,
  placeIdsToLocate,
  reusableLocations,
  toSavedPlaces,
} from '@/lib/maps/place-locations';

const now = new Date('2027-04-10T12:00:00Z');
const place = (location_fetched_at: string | null) => ({
  lat: 35.71,
  lng: 139.79,
  location_fetched_at,
});

describe('freshLocation', () => {
  it('30 天內的座標可以用', () => {
    expect(freshLocation(place('2027-03-11T12:00:00Z'), now)).toEqual({ lat: 35.71, lng: 139.79 });
  });

  it('超過 30 天或沒有抓取時間的座標當作沒有', () => {
    expect(freshLocation(place('2027-03-11T11:59:00Z'), now)).toBeNull();
    expect(freshLocation(place(null), now)).toBeNull();
    expect(freshLocation({ lat: null, lng: null, location_fetched_at: null }, now)).toBeNull();
  });
});

describe('isPlaceId', () => {
  it('只接受英數、底線、連字號', () => {
    expect(isPlaceId('ChIJ0YwG28aOGGARvRKAXIBWqNk')).toBe(true);
    expect(isPlaceId('')).toBe(false);
    expect(isPlaceId('../places')).toBe(false);
    expect(isPlaceId('abc?key=x')).toBe(false);
  });
});

describe('reusableLocations', () => {
  it('只沿用 30 天內、有地點 ID 的座標，保留原本的抓取時間', () => {
    const locations = reusableLocations(
      [
        { place_id: 'fresh', lat: 35.7, lng: 139.8, location_fetched_at: '2027-04-01T00:00:00Z' },
        { place_id: 'old', lat: 35.7, lng: 139.8, location_fetched_at: '2027-02-01T00:00:00Z' },
        { place_id: 'none', lat: null, lng: null, location_fetched_at: null },
      ],
      now,
    );
    expect([...locations]).toEqual([
      ['fresh', { lat: 35.7, lng: 139.8, fetchedAt: '2027-04-01T00:00:00Z' }],
    ]);
  });
});

describe('placeIdsToLocate', () => {
  it('還沒有座標的連結地點，不重複', () => {
    const known = new Map([['fresh', { lat: 1, lng: 2, fetchedAt: 'x' }]]);
    expect(
      placeIdsToLocate(
        [
          { name: 'A', placeId: 'fresh' },
          { name: 'B', placeId: 'new' },
          { name: 'B again', placeId: 'new' },
          { name: 'C', placeId: null },
        ],
        known,
      ),
    ).toEqual(['new']);
  });
});

describe('toSavedPlaces', () => {
  it('連結的地點帶 provider 與座標；查不到座標仍保留連結；純文字全是 null', () => {
    const locations = new Map([
      ['p1', { lat: 35.7, lng: 139.8, fetchedAt: '2027-04-10T12:00:00Z' }],
    ]);
    expect(
      toSavedPlaces(
        [
          { name: '淺草寺', placeId: 'p1' },
          { name: '晴空塔', placeId: 'p2' },
          { name: '仲見世通', placeId: null },
        ],
        locations,
      ),
    ).toEqual([
      {
        name: '淺草寺',
        provider: 'google',
        place_id: 'p1',
        lat: 35.7,
        lng: 139.8,
        location_fetched_at: '2027-04-10T12:00:00Z',
      },
      {
        name: '晴空塔',
        provider: 'google',
        place_id: 'p2',
        lat: null,
        lng: null,
        location_fetched_at: null,
      },
      {
        name: '仲見世通',
        provider: null,
        place_id: null,
        lat: null,
        lng: null,
        location_fetched_at: null,
      },
    ]);
  });
});
