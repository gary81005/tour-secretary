export const DEFAULT_TIMEZONE = 'Asia/Tokyo';

// 時區選單的常用選項（Q5）；選單最下面另有「其他」可以搜尋完整清單。
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
