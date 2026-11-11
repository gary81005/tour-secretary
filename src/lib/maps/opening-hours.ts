import dayjs from '@/lib/dayjs';
import { toHourMinute } from '@/lib/trip/time-slot';
import type { OpeningHours, OpeningPeriod, PlaceDetails } from './types';

// 營業時間（ADR 0006 Q8）：依項目所在日期判斷。日期與時間都是地點的當地時間，與行程一致，不需要換算。

// 一段營業時間，以當天 00:00 起算的分鐘數。end 可以超過 1440（營業到隔天凌晨）。
// fromPreviousDay：前一天開始、延續到當天凌晨的部分；判斷營業中要算進去，顯示時通常略過。
export type HoursRange = { start: number; end: number; fromPreviousDay: boolean };

export type DayHours = {
  // current：7 天內，用含特殊營業日的 currentOpeningHours；regular：一般營業時間
  source: 'current' | 'regular';
  ranges: HoursRange[];
};

export type HoursStatus =
  'closedPermanently' | 'closedTemporarily' | 'closedThatDay' | 'maybeClosed';

// currentOpeningHours 涵蓋今天起 7 天。
export const CURRENT_HOURS_DAYS = 7;

const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;

const minutesOf = (point: { hour: number; minute: number }) => point.hour * 60 + point.minute;

// date 那天的營業時間；ranges 為空表示公休。Google 沒有營業時間資料時回傳 null。
// today 是地點當地的今天（YYYY-MM-DD）。
export function hoursOnDate(
  details: Pick<PlaceDetails, 'regularHours' | 'currentHours'>,
  date: string,
  today: string,
): DayHours | null {
  const daysAhead = dayjs.utc(date).diff(dayjs.utc(today), 'day');
  if (details.currentHours && daysAhead >= 0 && daysAhead < CURRENT_HOURS_DAYS) {
    return { source: 'current', ranges: datedRanges(details.currentHours, date) };
  }
  if (details.regularHours) {
    return { source: 'regular', ranges: weeklyRanges(details.regularHours, dayjs.utc(date).day()) };
  }
  return null;
}

// 項目卡片上的標記。只有填了精確時間的項目才判斷「可能未營業」（以開始時間是否在營業時間內）。
export function hoursStatus(
  details: Pick<PlaceDetails, 'businessStatus' | 'regularHours' | 'currentHours'>,
  item: { date: string; start_time: string | null },
  today: string,
): HoursStatus | null {
  if (details.businessStatus === 'closedPermanently') return 'closedPermanently';
  if (details.businessStatus === 'closedTemporarily') return 'closedTemporarily';

  const hours = hoursOnDate(details, item.date, today);
  if (!hours) return null;
  if (hours.ranges.length === 0) return 'closedThatDay';
  if (item.start_time === null) return null;

  const [hour, minute] = toHourMinute(item.start_time).split(':').map(Number);
  const start = hour * 60 + minute;
  return hours.ranges.some((range) => range.start <= start && start < range.end)
    ? null
    : 'maybeClosed';
}

// 項目卡片上一個地點的營業資訊。ranges 只含當天開始的時段（前一天延續到凌晨的不顯示）；
// null 表示 Google 沒有營業時間資料。
export type PlaceHours = { status: HoursStatus | null; ranges: HoursRange[] | null };

export function placeHours(
  details: Pick<PlaceDetails, 'businessStatus' | 'regularHours' | 'currentHours'>,
  item: { date: string; start_time: string | null },
  today: string,
): PlaceHours {
  const hours = hoursOnDate(details, item.date, today);
  return {
    status: hoursStatus(details, item, today),
    ranges: hours ? hours.ranges.filter((range) => !range.fromPreviousDay) : null,
  };
}

// 整天營業（24 小時）。
export function isAllDay(range: HoursRange): boolean {
  return range.start === 0 && range.end >= DAY_MINUTES;
}

// 「09:00–17:00」；營業到隔天凌晨時顯示「18:00–02:00」。
export function formatHoursRange(range: HoursRange): string {
  const clock = (minutes: number) => {
    const inDay = minutes % DAY_MINUTES;
    return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
  };
  return `${clock(range.start)}–${clock(range.end)}`;
}

// 一般營業時間：依星期（0＝星期日）。
function weeklyRanges(hours: OpeningHours, weekday: number): HoursRange[] {
  if (isAlwaysOpen(hours.periods)) return [{ start: 0, end: DAY_MINUTES, fromPreviousDay: false }];

  return hours.periods.flatMap((period) => {
    if (!period.close) return [];
    const open = minutesOf(period.open);
    // 以開始那天 00:00 起算的打烊時間；打烊時間不晚於開始時間時表示跨了整整一週。
    let close =
      ((period.close.day - period.open.day + 7) % 7) * DAY_MINUTES + minutesOf(period.close);
    if (close <= open) close += WEEK_MINUTES;
    // 目標那天的 00:00，以開始那天 00:00 起算。
    const offset = ((weekday - period.open.day + 7) % 7) * DAY_MINUTES;
    return toRanges(open, close, offset);
  });
}

// currentOpeningHours：每段都有日期。
function datedRanges(hours: OpeningHours, date: string): HoursRange[] {
  return hours.periods.flatMap((period) => {
    if (!period.open.date) return [];
    const openDay = dayjs.utc(period.open.date);
    const open = minutesOf(period.open);
    // 沒有打烊時間（24 小時，或超出 7 天被截斷）時，當作營業到當天結束。
    const close = period.close?.date
      ? dayjs.utc(period.close.date).diff(openDay, 'day') * DAY_MINUTES + minutesOf(period.close)
      : DAY_MINUTES;
    const offset = dayjs.utc(date).diff(openDay, 'day') * DAY_MINUTES;
    return toRanges(open, close, offset);
  });
}

// 把「開始那天 00:00 起算」的 [open, close) 換成目標那天（offset）的範圍。
function toRanges(open: number, close: number, offset: number): HoursRange[] {
  if (offset === 0) return [{ start: open, end: close, fromPreviousDay: false }];
  if (offset > 0 && close > offset) {
    return [{ start: 0, end: Math.min(close - offset, DAY_MINUTES), fromPreviousDay: true }];
  }
  return [];
}

// Google 表示 24 小時營業：只有一段，星期日 00:00 開始，沒有打烊時間。
function isAlwaysOpen(periods: readonly OpeningPeriod[]): boolean {
  return (
    periods.length === 1 &&
    periods[0].close === null &&
    periods[0].open.day === 0 &&
    minutesOf(periods[0].open) === 0
  );
}
