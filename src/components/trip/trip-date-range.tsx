import { useLocale } from 'next-intl';
import { formatTripDateRange } from '@/lib/trip/trip-dates';

export function TripDateRange({ startDate, endDate }: { startDate: string; endDate: string }) {
  const locale = useLocale();

  return <time dateTime={startDate}>{formatTripDateRange(locale, startDate, endDate)}</time>;
}
