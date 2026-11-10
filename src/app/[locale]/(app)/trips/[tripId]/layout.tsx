import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { getUndoableImportId } from '@/data/imports';
import { getTrip, getTripDays } from '@/data/trips';
import { TripMenu } from './trip-menu';
import { TripTabs } from './trip-tabs';

type Params = LayoutProps<'/[locale]/trips/[tripId]'>['params'];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const trip = await getTrip((await params).tripId);
  return { title: trip?.name };
}

// 行程頁共用的頁首：名稱、日期、「⋯」選單，以及「行程、住宿、提醒、限制」四個分頁（Q10）。
export default function TripLayout({ children, params }: { children: ReactNode; params: Params }) {
  return (
    <div className='flex flex-col'>
      <Suspense fallback={<div className='h-28 animate-pulse' aria-hidden='true' />}>
        <TripHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function TripHeader({ params }: { params: Params }) {
  const { tripId } = await params;
  const [trip, days, undoableImportId] = await Promise.all([
    getTrip(tripId),
    getTripDays(tripId),
    getUndoableImportId(tripId),
  ]);
  if (!trip) notFound();

  return (
    <div className='flex flex-col gap-3 pt-5'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-col gap-1'>
          <h1 className='text-2xl font-semibold tracking-tight break-words'>{trip.name}</h1>
          <p className='text-sm text-muted-foreground'>
            <TripDateRange startDate={trip.start_date} endDate={trip.end_date} />
          </p>
        </div>
        <TripMenu
          trip={trip}
          days={days.map((day) => ({ id: day.id, date: day.date }))}
          undoableImportId={undoableImportId}
        />
      </div>
      <TripTabs tripId={trip.id} />
    </div>
  );
}
