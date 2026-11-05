import { describe, expect, it } from 'vitest';
import { groupTripsByPhase, summarizeTrip, type TripListSource } from '@/lib/trip/trip-list';

const trip = (id: string, start: string, end: string, cities: (string | null)[] = []) =>
  ({
    id,
    name: id,
    start_date: start,
    end_date: end,
    default_timezone: 'Asia/Tokyo',
    days: cities.map((city, i) => ({
      date: `${start.slice(0, 8)}${String(Number(start.slice(8)) + i).padStart(2, '0')}`,
      city,
      timezone: null,
    })),
  }) satisfies TripListSource;

// 東京 2027-03-07 12:00
const NOW = new Date('2027-03-07T03:00:00Z');

describe('summarizeTrip', () => {
  it('天數、城市去重複（依日期順序）、進行中第幾天', () => {
    const summary = summarizeTrip(
      trip('tohoku', '2027-03-05', '2027-03-09', ['東京', '東京', '仙台', null, ' 仙台 ']),
      NOW,
    );
    expect(summary).toMatchObject({
      dayCount: 5,
      cities: ['東京', '仙台'],
      phase: 'ongoing',
      currentDay: 3,
    });
  });

  it('天的資料沒照日期排也能正確計算', () => {
    const source = trip('t', '2027-03-06', '2027-03-08', ['A', 'B', 'C']);
    const summary = summarizeTrip({ ...source, days: source.days.toReversed() }, NOW);
    expect(summary.cities).toEqual(['A', 'B', 'C']);
    expect(summary.currentDay).toBe(2);
  });

  it('即將出發與已結束沒有 currentDay', () => {
    expect(
      summarizeTrip(trip('next', '2027-04-01', '2027-04-02', [null, null]), NOW),
    ).toMatchObject({
      phase: 'upcoming',
      currentDay: null,
    });
    expect(summarizeTrip(trip('old', '2027-01-01', '2027-01-02', [null, null]), NOW)).toMatchObject(
      {
        phase: 'past',
        currentDay: null,
      },
    );
  });
});

describe('groupTripsByPhase', () => {
  it('即將出發由近到遠，已結束由新到舊', () => {
    const summaries = [
      trip('far', '2027-06-01', '2027-06-02', [null, null]),
      trip('old', '2026-01-01', '2026-01-02', [null, null]),
      trip('now', '2027-03-06', '2027-03-08', [null, null, null]),
      trip('soon', '2027-04-01', '2027-04-02', [null, null]),
      trip('recent', '2027-02-01', '2027-02-02', [null, null]),
    ].map((t) => summarizeTrip(t, NOW));

    const groups = groupTripsByPhase(summaries);
    expect(groups.ongoing.map((t) => t.id)).toEqual(['now']);
    expect(groups.upcoming.map((t) => t.id)).toEqual(['soon', 'far']);
    expect(groups.past.map((t) => t.id)).toEqual(['recent', 'old']);
  });
});
