import { PlusIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { getTripListGroups } from '@/data/trips';
import { Link } from '@/i18n/navigation';
import { TRIP_PHASE_ORDER } from '@/lib/trip/trip-list';
import { InstallPrompt } from './_components/install-prompt';
import { EmptyTrips, ImportLink, TripGroup, TripListSkeleton } from './_components/trip-list';

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

  const offlineHint = [...groups.ongoing, ...groups.upcoming].some((trip) => trip.offlineSnapshot);

  return (
    <>
      <InstallPrompt offlineHint={offlineHint} />
      {hasTrips ? (
        <div className='flex flex-col gap-8'>
          {TRIP_PHASE_ORDER.map(
            (phase) =>
              groups[phase].length > 0 && (
                <TripGroup key={phase} phase={phase} trips={groups[phase]} />
              ),
          )}
        </div>
      ) : (
        <EmptyTrips />
      )}
    </>
  );
}
