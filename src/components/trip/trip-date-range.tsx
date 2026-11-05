import { useFormatter } from 'next-intl';
import { localDateToUtc } from '@/lib/trip/trip-dates';

export function TripDateRange({ startDate, endDate }: { startDate: string; endDate: string }) {
  const format = useFormatter();

  return (
    <time dateTime={startDate}>
      {format.dateTimeRange(localDateToUtc(startDate), localDateToUtc(endDate), {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
        timeZone: 'UTC',
      })}
    </time>
  );
}
