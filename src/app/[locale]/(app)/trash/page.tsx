import { Trash2Icon } from 'lucide-react';
import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { TripDateRange } from '@/components/trip/trip-date-range';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { getTrashedTrips } from '@/data/trips';
import { daysUntilPurge } from '@/lib/trip/trash';
import { TrashItemActions } from './trash-item-actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trips.trash');
  return { title: t('title') };
}

export default function TrashPage() {
  const t = useTranslations('trips.trash');

  return (
    <div className='flex flex-col gap-6 py-6'>
      <div className='flex flex-col gap-1'>
        <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
        <p className='text-sm text-muted-foreground'>{t('description')}</p>
      </div>
      <Suspense fallback={<div className='h-24 animate-pulse rounded-lg bg-muted' />}>
        <TrashList />
      </Suspense>
    </div>
  );
}

type TrashedTrip = Awaited<ReturnType<typeof getTrashedTrips>>[number] & { daysLeft: number };

async function TrashList() {
  const trashed = await getTrashedTrips();
  // cacheComponents：要在讀過請求資料（cookie）之後才能取目前時間，否則 build 失敗。
  const now = new Date();
  const trips: TrashedTrip[] = trashed.map((trip) => ({
    ...trip,
    daysLeft: daysUntilPurge(trip.deleted_at, now),
  }));

  return <TrashListView trips={trips} />;
}

function TrashListView({ trips }: { trips: TrashedTrip[] }) {
  const t = useTranslations('trips.trash');

  if (trips.length === 0) {
    return (
      <Empty className='border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Trash2Icon />
          </EmptyMedia>
          <EmptyTitle>{t('empty.title')}</EmptyTitle>
          <EmptyDescription>{t('empty.description')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className='flex flex-col gap-3'>
      {trips.map((trip) => (
        <li key={trip.id} className='flex flex-col gap-3 rounded-lg border p-4'>
          <div className='flex flex-col gap-1'>
            <span className='font-medium break-words'>{trip.name}</span>
            <span className='text-sm text-muted-foreground'>
              <TripDateRange startDate={trip.start_date} endDate={trip.end_date} />
            </span>
            <span className='text-sm text-destructive'>
              {t('daysLeft', { days: trip.daysLeft })}
            </span>
          </div>
          <TrashItemActions tripId={trip.id} tripName={trip.name} />
        </li>
      ))}
    </ul>
  );
}
