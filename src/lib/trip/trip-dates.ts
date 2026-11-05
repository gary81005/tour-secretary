import dayjs from '@/lib/dayjs';

// 與資料庫 trips_date_range 一致。
export const MAX_TRIP_DAYS = 60;

// 日期一律是 'YYYY-MM-DD' 的當地日期，用 UTC 計算避免裝置時區與日光節約時間的影響。
export function addDays(date: string, days: number): string {
  return dayjs.utc(date).add(days, 'day').format('YYYY-MM-DD');
}

export function countDays(startDate: string, endDate: string): number {
  return dayjs.utc(endDate).diff(dayjs.utc(startDate), 'day') + 1;
}

export function listDates(startDate: string, endDate: string): string[] {
  return Array.from({ length: Math.max(countDays(startDate, endDate), 0) }, (_, i) =>
    addDays(startDate, i),
  );
}

export type DayWithItemCount = { id: string; date: string; itemCount: number };

export type DateRangeChangePlan<T extends DayWithItemCount> = {
  // 新範圍外、會被刪掉的天
  removed: T[];
  // removed 之中還有項目的天：有任何一筆就要擋下修改（Q15）
  blocked: T[];
  // 新範圍內、目前還沒有的日期
  added: string[];
};

// 「修改起訖日」以日期對應：保留還在新範圍內的天。「整趟平移」另外處理，不走這裡。
export function planDateRangeChange<T extends DayWithItemCount>(
  days: readonly T[],
  startDate: string,
  endDate: string,
): DateRangeChangePlan<T> {
  const removed = days.filter((day) => day.date < startDate || day.date > endDate);
  const existing = new Set(days.map((day) => day.date));
  return {
    removed,
    blocked: removed.filter((day) => day.itemCount > 0),
    added: listDates(startDate, endDate).filter((date) => !existing.has(date)),
  };
}

// 'YYYY-MM-DD' 當地日期 → UTC 午夜的 Date。格式化時要搭配 timeZone: 'UTC'，
// 才不會被裝置時區往前或往後推一天。
export function localDateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
