import { MapPinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { Badge } from '@/components/ui/badge';
import { getTodayProgressItems } from '@/data/trips';
import { Link } from '@/i18n/navigation';
import { dayProgress } from '@/lib/trip/progress';
import type { TripSummary } from '@/lib/trip/trip-list';

// 首頁的行程卡片：日期、天數、城市；進行中時加上今天的進度。
export function TripCard({ trip }: { trip: TripSummary }) {
  const t = useTranslations('trips.list');

  return (
    <Link
      href={`/trips/${trip.id}`}
      className='flex flex-col gap-1.5 rounded-lg border bg-card p-4 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50'
    >
      <div className='flex items-start justify-between gap-3'>
        <span className='font-medium'>{trip.name}</span>
        {trip.currentDay !== null && (
          <Badge className='shrink-0'>{t('currentDay', { day: trip.currentDay })}</Badge>
        )}
      </div>
      <div className='text-sm text-muted-foreground'>
        <TripDateRange startDate={trip.startDate} endDate={trip.endDate} />
        {' · '}
        {t('dayCount', { count: trip.dayCount })}
      </div>
      {trip.cities.length > 0 && (
        <div className='flex items-center gap-1 text-sm text-muted-foreground'>
          <MapPinIcon className='size-3.5 shrink-0' aria-hidden='true' />
          <span className='truncate'>{trip.cities.join(' · ')}</span>
        </div>
      )}
      {trip.currentDate && (
        <Suspense fallback={null}>
          <TodayProgress tripId={trip.id} date={trip.currentDate} />
        </Suspense>
      )}
    </Link>
  );
}

// 進行中的行程：今天進行到哪（ADR 0010）。查不到時不顯示，不影響行程列表。
async function TodayProgress({ tripId, date }: { tripId: string; date: string }) {
  const items = await getTodayProgressItems(tripId, date).catch(() => null);
  if (!items || items.length === 0) return null;

  const t = await getTranslations('trips.now');
  const { current, next } = dayProgress(items);
  if (!current) {
    return <p className='truncate text-sm font-medium text-primary'>{t('homeAllDone')}</p>;
  }
  return (
    <div className='flex flex-col gap-0.5 text-sm'>
      <p className='truncate font-medium text-primary'>
        {t('homeCurrent', { title: current.title })}
      </p>
      {next && (
        <p className='truncate text-muted-foreground'>{t('homeNext', { title: next.title })}</p>
      )}
    </div>
  );
}
