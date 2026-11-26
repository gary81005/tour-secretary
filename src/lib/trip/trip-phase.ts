import { localDate } from './timezones';

// 行程的階段（即將出發／進行中／已結束）與「今天是第幾天」。
// 「今天」依每一天自己的時區判斷，不看裝置時區（ADR 0004 Q20）。

export type TripPhase = 'upcoming' | 'ongoing' | 'past';

// timezone 是這一天實際使用的時區（resolveTimezone）。
export type DayInZone = { date: string; timezone: string };

// 「今天」是第幾天（從 0 起算）。還沒出發或已經結束時回傳 -1。
// 跨時區換日的空檔（例如前一天在台北、隔天在東京）算在前一天。
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
