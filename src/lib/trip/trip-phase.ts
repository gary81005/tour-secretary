import dayjs from '@/lib/dayjs';

export type TripPhase = 'upcoming' | 'ongoing' | 'past';

// timezone 是這一天實際使用的時區（days.timezone ?? trips.default_timezone）。
export type DayInZone = { date: string; timezone: string };

export function resolveTimezone(day: { timezone: string | null }, defaultTimezone: string) {
  return day.timezone ?? defaultTimezone;
}

export function localDate(timezone: string, now: Date): string {
  return dayjs(now).tz(timezone).format('YYYY-MM-DD');
}

// 「今天」是第幾天（從 0 起算），依每一天自己的時區判斷，不看裝置時區（Q20）。
// 還沒出發或已經結束時回傳 -1。跨時區換日的空檔（例如前一天在台北、隔天在東京）算在前一天。
export function currentDayIndex(days: readonly DayInZone[], now: Date): number {
  let index = -1;
  days.forEach((day, i) => {
    if (day.date <= localDate(day.timezone, now)) index = i;
  });

  const last = days.at(-1);
  if (index === days.length - 1 && last && localDate(last.timezone, now) > last.date) {
    return -1;
  }
  return index;
}

export function getTripPhase(days: readonly DayInZone[], now: Date): TripPhase {
  if (currentDayIndex(days, now) >= 0) return 'ongoing';
  const first = days[0];
  if (!first || first.date > localDate(first.timezone, now)) return 'upcoming';
  return 'past';
}
