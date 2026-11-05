import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { getTrip } from '@/data/trips';
import { TripMenu } from './trip-menu';

type Params = PageProps<'/[locale]/trips/[tripId]'>['params'];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const trip = await getTrip((await params).tripId);
  return { title: trip?.name };
}

// 第 5 步的暫時版本：顯示行程名稱、日期與選單。第 6 步換成分頁與每天的行程。
export default function TripPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className='h-20 animate-pulse rounded-lg bg-muted' />}>
      <TripOverview params={params} />
    </Suspense>
  );
}

async function TripOverview({ params }: { params: Params }) {
  const trip = await getTrip((await params).tripId);
  if (!trip) notFound();

  return <TripOverviewView trip={trip} />;
}

function TripOverviewView({
  trip,
}: {
  trip: { id: string; name: string; start_date: string; end_date: string };
}) {
  const t = useTranslations('trips.trip');

  return (
    <div className='flex flex-col gap-4 py-6'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-col gap-1'>
          <h1 className='text-2xl font-semibold tracking-tight break-words'>{trip.name}</h1>
          <p className='text-sm text-muted-foreground'>
            <TripDateRange startDate={trip.start_date} endDate={trip.end_date} />
          </p>
        </div>
        <TripMenu tripId={trip.id} tripName={trip.name} />
      </div>
      <p className='text-sm text-muted-foreground'>{t('comingSoon')}</p>
    </div>
  );
}
