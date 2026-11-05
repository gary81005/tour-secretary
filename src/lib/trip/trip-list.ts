import { countDays } from './trip-dates';
import { currentDayIndex, getTripPhase, resolveTimezone, type TripPhase } from './trip-phase';

export type TripListSource = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  default_timezone: string;
  days: { date: string; city: string | null; timezone: string | null }[];
};

export type TripSummary = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  // 依日期順序、去除重複的城市
  cities: string[];
  phase: TripPhase;
  // 進行中時是第幾天（從 1 起算），其他狀態為 null
  currentDay: number | null;
};

export function summarizeTrip(trip: TripListSource, now: Date): TripSummary {
  const days = trip.days.toSorted((a, b) => a.date.localeCompare(b.date));
  const daysInZone = days.map((day) => ({
    date: day.date,
    timezone: resolveTimezone(day, trip.default_timezone),
  }));
  const index = currentDayIndex(daysInZone, now);
  const cities = days.map((day) => day.city?.trim()).filter((city): city is string => !!city);

  return {
    id: trip.id,
    name: trip.name,
    startDate: trip.start_date,
    endDate: trip.end_date,
    dayCount: countDays(trip.start_date, trip.end_date),
    cities: [...new Set(cities)],
    phase: getTripPhase(daysInZone, now),
    currentDay: index >= 0 ? index + 1 : null,
  };
}

export const TRIP_PHASE_ORDER = ['ongoing', 'upcoming', 'past'] as const satisfies TripPhase[];

// 行程列表分組（Q20）：進行中、即將出發依出發日由近到遠；已結束由新到舊。
export function groupTripsByPhase(trips: readonly TripSummary[]) {
  const byStart = (a: TripSummary, b: TripSummary) => a.startDate.localeCompare(b.startDate);
  const inPhase = (phase: TripPhase) => trips.filter((trip) => trip.phase === phase);

  return {
    ongoing: inPhase('ongoing').toSorted(byStart),
    upcoming: inPhase('upcoming').toSorted(byStart),
    past: inPhase('past').toSorted((a, b) => byStart(b, a)),
  } satisfies Record<TripPhase, TripSummary[]>;
}
