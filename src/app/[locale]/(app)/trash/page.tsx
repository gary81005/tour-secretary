import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getTrashedTrips } from '@/data/trips';
import { daysUntilPurge } from '@/lib/trip/trash';
import { TrashListView, type TrashedTrip } from './_components/trash-list';

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
