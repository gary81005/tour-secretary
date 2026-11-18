import { describe, expect, it } from 'vitest';
import {
  buildOfflineSnapshot,
  isSnapshotCurrent,
  OFFLINE_SNAPSHOT_VERSION,
  type OfflineSnapshotSource,
} from '@/lib/offline/snapshot';

const trip = {
  id: 'trip-1',
  name: '東京',
  start_date: '2027-03-05',
  end_date: '2027-03-07',
  default_timezone: 'Asia/Tokyo',
};

const item = (id: string, day_id: string, position: number) => ({
  id,
  day_id,
  title: id,
  time_slot: 'morning' as const,
  category: 'sightseeing' as const,
  start_time: null,
  end_time: null,
  description: null,
  url: null,
  position,
  done_at: null,
  skipped_at: null,
  updated_at: '2027-03-01T00:00:00Z',
  replaces_item_id: null,
  item_places: [],
  fallbacks: [],
});

const source = (overrides: Partial<OfflineSnapshotSource> = {}): OfflineSnapshotSource => ({
  trip,
  days: [
    { id: 'd2', date: '2027-03-06', city: '東京', timezone: null },
    { id: 'd1', date: '2027-03-05', city: '東京', timezone: null },
    { id: 'd3', date: '2027-03-07', city: '台北', timezone: 'Asia/Taipei' },
  ],
  items: [],
  stays: [],
  notes: [],
  constraints: [],
  ...overrides,
});

const fetchedAt = new Date('2027-03-04T00:00:00Z');

describe('buildOfflineSnapshot', () => {
  it('天依日期排序，項目放進所屬的天並依 position 排序', () => {
    const snapshot = buildOfflineSnapshot(
      source({
        items: [item('b', 'd1', 1), item('c', 'd2', 0), item('a', 'd1', 0), item('x', 'gone', 0)],
      }),
      fetchedAt,
    );

    expect(snapshot.version).toBe(OFFLINE_SNAPSHOT_VERSION);
    expect(snapshot.tripId).toBe('trip-1');
    expect(snapshot.fetchedAt).toBe('2027-03-04T00:00:00.000Z');
    expect(snapshot.days.map((day) => day.id)).toEqual(['d1', 'd2', 'd3']);
    expect(snapshot.days.map((day) => day.items.map((i) => i.id))).toEqual([['a', 'b'], ['c'], []]);
  });

  it('不存座標與查詢多帶的欄位（ADR 0006）', () => {
    const snapshot = buildOfflineSnapshot(
      source({
        items: [
          {
            ...item('a', 'd1', 0),
            item_places: [
              { id: 'p2', name: '淺草寺', position: 1, place_id: 'g-2', lat: 35.7, lng: 139.8 },
              { id: 'p1', name: '雷門', position: 0, place_id: null },
            ] as OfflineSnapshotSource['items'][number]['item_places'],
          },
        ],
        stays: [
          {
            id: 's1',
            name: '飯店',
            check_in: '2027-03-05',
            check_out: '2027-03-07',
            address: null,
            status: 'booked',
            confirmation_code: 'ABC',
            url: null,
            note: null,
            place_id: 'g-3',
            lat: 35.6,
            lng: 139.7,
            location_fetched_at: '2027-03-01T00:00:00Z',
          } as OfflineSnapshotSource['stays'][number],
        ],
      }),
      fetchedAt,
    );

    expect(snapshot.days[0].items[0].item_places).toEqual([
      { id: 'p1', name: '雷門', position: 0, place_id: null },
      { id: 'p2', name: '淺草寺', position: 1, place_id: 'g-2' },
    ]);
    expect(snapshot.days[0].items[0]).not.toHaveProperty('day_id');
    expect(snapshot.stays[0]).not.toHaveProperty('lat');
    expect(snapshot.stays[0]).not.toHaveProperty('location_fetched_at');
    expect(JSON.stringify(snapshot)).not.toMatch(/lat|lng/);
  });
});

describe('isSnapshotCurrent', () => {
  const snapshot = buildOfflineSnapshot(source(), fetchedAt);

  it('7 天內出發與進行中的行程可以用', () => {
    expect(isSnapshotCurrent(snapshot, new Date('2027-02-26T00:00:00Z'))).toBe(true);
    expect(isSnapshotCurrent(snapshot, new Date('2027-03-06T00:00:00Z'))).toBe(true);
  });

  it('超過 7 天才出發，或行程結束隔天就過期', () => {
    expect(isSnapshotCurrent(snapshot, new Date('2027-02-25T00:00:00Z'))).toBe(false);
    // 最後一天在台北：台北的 3/8 才算結束
    expect(isSnapshotCurrent(snapshot, new Date('2027-03-07T15:59:00Z'))).toBe(true);
    expect(isSnapshotCurrent(snapshot, new Date('2027-03-07T16:00:00Z'))).toBe(false);
  });

  it('其他版本或格式不符的資料不能用', () => {
    const now = new Date('2027-03-06T00:00:00Z');
    expect(isSnapshotCurrent({ ...snapshot, version: 0 }, now)).toBe(false);
    expect(isSnapshotCurrent({ tripId: 'trip-1' }, now)).toBe(false);
    expect(isSnapshotCurrent(null, now)).toBe(false);
  });
});
