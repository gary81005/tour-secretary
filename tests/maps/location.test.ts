import { describe, expect, it } from 'vitest';
import { freshLocation, isPlaceId } from '@/lib/maps/location';

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
