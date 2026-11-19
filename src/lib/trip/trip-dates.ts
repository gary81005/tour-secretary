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

export type DateRangeChangePlan<T extends { date: string }> = {
  // 新範圍外、會被刪掉的天
  removed: T[];
  // 新範圍內、目前還沒有的日期
  added: string[];
};

// 「修改起訖日」的預告（ADR 0004 Q15）：以日期對應，保留還在新範圍內的天。
// 要刪的天如果還有項目，由資料庫的 set_trip_dates() 擋下並回傳日期，這裡不判斷。
export function planDateRangeChange<T extends { date: string }>(
  days: readonly T[],
  startDate: string,
  endDate: string,
): DateRangeChangePlan<T> {
  const existing = new Set(days.map((day) => day.date));
  return {
    removed: days.filter((day) => day.date < startDate || day.date > endDate),
    added: listDates(startDate, endDate).filter((date) => !existing.has(date)),
  };
}

// 'YYYY-MM-DD' 當地日期 → UTC 午夜的 Date。格式化時要搭配 timeZone: 'UTC'，
// 才不會被裝置時區往前或往後推一天。
export function localDateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

const TRIP_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  timeZone: 'UTC',
};

// 行程的起訖日，例如「2027/3/5 週五 至 2027/3/9 週二」；同一天時只有一個日期。
// 比較好讀的空格（分隔字與標點由語系決定，不寫死）：
// - 起訖之間的分隔字（zh-TW 是「至」）前後加空格
// - 星期緊接在日期後面時（zh-TW 範圍格式是「3/5週五」）中間加空格；前面已經有標點（「（週五）」）就不加
export function formatTripDateRange(locale: string, startDate: string, endDate: string): string {
  const parts = new Intl.DateTimeFormat(locale, TRIP_DATE_FORMAT).formatRangeToParts(
    localDateToUtc(startDate),
    localDateToUtc(endDate),
  );
  return parts
    .map((part, index) => {
      const previous = parts[index - 1];
      if (
        part.type === 'literal' &&
        part.source === 'shared' &&
        previous?.source === 'startRange' &&
        parts[index + 1]?.source === 'endRange'
      ) {
        return ` ${part.value.trim()} `;
      }
      if (part.type === 'weekday' && previous && previous.type !== 'literal') {
        return ` ${part.value}`;
      }
      return part.value;
    })
    .join('');
}
