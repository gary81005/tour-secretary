import { FileSpreadsheetIcon, MapPinIcon, PlusIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getTripListGroups } from '@/data/trips';
import { Link } from '@/i18n/navigation';
import { TRIP_PHASE_ORDER, type TripSummary } from '@/lib/trip/trip-list';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trips.list');
  return { title: t('title') };
}

export default function TripListPage() {
  const t = useTranslations('trips.list');

  return (
    <div className='flex flex-col gap-6 py-6'>
      <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-3'>
        <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
        <div className='flex gap-2'>
          <ImportLink />
          <Link href='/trips/new' className={buttonVariants({ size: 'lg' })}>
            <PlusIcon />
            {t('create')}
          </Link>
        </div>
      </div>
      <Suspense fallback={<TripListSkeleton />}>
        <TripList />
      </Suspense>
    </div>
  );
}

async function TripList() {
  const groups = await getTripListGroups();
  const hasTrips = TRIP_PHASE_ORDER.some((phase) => groups[phase].length > 0);

  if (!hasTrips) return <EmptyTrips />;

  return (
    <div className='flex flex-col gap-8'>
      {TRIP_PHASE_ORDER.map(
        (phase) =>
          groups[phase].length > 0 && <TripGroup key={phase} phase={phase} trips={groups[phase]} />,
      )}
    </div>
  );
}

function TripGroup({
  phase,
  trips,
}: {
  phase: (typeof TRIP_PHASE_ORDER)[number];
  trips: TripSummary[];
}) {
  const t = useTranslations('trips.list');

  return (
    <section className='flex flex-col gap-3' aria-labelledby={`trips-${phase}`}>
      <h2 id={`trips-${phase}`} className='text-sm font-medium text-muted-foreground'>
        {t(`phases.${phase}`)}
      </h2>
      <ul className='flex flex-col gap-3'>
        {trips.map((trip) => (
          <li key={trip.id}>
            <TripCard trip={trip} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TripCard({ trip }: { trip: TripSummary }) {
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
    </Link>
  );
}

function EmptyTrips() {
  const t = useTranslations('trips.list');

  return (
    <Empty className='border'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <MapPinIcon />
        </EmptyMedia>
        <EmptyTitle>{t('empty.title')}</EmptyTitle>
        <EmptyDescription>{t('empty.description')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className='flex-row justify-center'>
        <ImportLink />
        <Link href='/trips/new' className={buttonVariants({ size: 'lg' })}>
          <PlusIcon />
          {t('create')}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

// 匯入 xlsx 建立行程（ADR 0008 Q12：放在「建立行程」旁邊）。
function ImportLink() {
  const t = useTranslations('import');

  return (
    <Link href='/trips/import' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
      <FileSpreadsheetIcon />
      {t('entry')}
    </Link>
  );
}

function TripListSkeleton() {
  return (
    <div className='flex flex-col gap-3' aria-hidden='true'>
      {[0, 1].map((index) => (
        <div key={index} className='h-24 animate-pulse rounded-lg bg-muted' />
      ))}
    </div>
  );
}
