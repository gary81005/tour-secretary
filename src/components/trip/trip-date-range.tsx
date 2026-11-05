import { useFormatter } from 'next-intl';

// 'YYYY-MM-DD' 是當地日期，用 UTC 午夜表示並以 UTC 格式化，避免被裝置時區往前或往後推一天。
function toDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

export function TripDateRange({ startDate, endDate }: { startDate: string; endDate: string }) {
  const format = useFormatter();

  return (
    <time dateTime={startDate}>
      {format.dateTimeRange(toDate(startDate), toDate(endDate), {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        timeZone: 'UTC',
      })}
    </time>
  );
}
