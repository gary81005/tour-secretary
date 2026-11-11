import { describe, expect, it } from 'vitest';
import { searchBias } from '@/lib/maps/search-bias';

const now = new Date('2027-04-10T12:00:00Z');
const at = (lat: number, fetchedAt = '2027-04-01T00:00:00Z') => ({
  lat,
  lng: 139.8,
  location_fetched_at: fetchedAt,
});
const text = { lat: null, lng: null, location_fetched_at: null };

describe('searchBias', () => {
  it('先用當天第一個有座標的地點', () => {
    expect(
      searchBias({ places: [text, at(35.7)], stays: [at(38.2)], timezone: 'Asia/Tokyo', now }),
    ).toEqual({ center: { lat: 35.7, lng: 139.8 }, regionCode: 'JP' });
  });

  it('地點都沒有座標（或超過 30 天）時用住宿', () => {
    expect(
      searchBias({
        places: [text, at(35.7, '2027-01-01T00:00:00Z')],
        stays: [at(38.2)],
        timezone: 'Asia/Tokyo',
        now,
      }).center,
    ).toEqual({ lat: 38.2, lng: 139.8 });
  });

  it('都沒有時只帶國家', () => {
    expect(searchBias({ places: [], stays: [text], timezone: 'Asia/Seoul', now })).toEqual({
      center: null,
      regionCode: 'KR',
    });
  });
});
