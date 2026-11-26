import dayjs from '@/lib/dayjs';

export const DEFAULT_TIMEZONE = 'Asia/Tokyo';

// 時區選單的常用選項（ADR 0004 Q5）；選單最下面另有「其他」可以搜尋完整清單。
export const COMMON_TIMEZONES = [
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Taipei',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Ho_Chi_Minh',
  'Asia/Manila',
] as const;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function listAllTimezones(): string[] {
  return Intl.supportedValuesOf('timeZone');
}

// 這一天實際使用的時區：天沒有設定就沿用行程的預設時區（ADR 0004 Q5）。
export function resolveTimezone(day: { timezone: string | null }, defaultTimezone: string) {
  return day.timezone ?? defaultTimezone;
}

// 那個時區現在的日期（YYYY-MM-DD）。
export function localDate(timezone: string, now: Date): string {
  return dayjs(now).tz(timezone).format('YYYY-MM-DD');
}

// 那個時區現在幾點（HH:MM），落後提醒用（ADR 0009「M6 細節」）。
export function localTime(timezone: string, now: Date): string {
  return dayjs(now).tz(timezone).format('HH:mm');
}
