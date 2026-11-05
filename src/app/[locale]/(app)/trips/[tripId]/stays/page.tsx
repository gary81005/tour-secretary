import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getTrip, getTripStays } from '@/data/trips';
import { StayList } from './stay-list';

type Props = PageProps<'/[locale]/trips/[tripId]/stays'>;

// 住宿分頁（Q8）：依入住日排序，日期重疊只提醒不阻擋（Q23）。
export default function StaysPage({ params }: Props) {
  return (
    <Suspense fallback={<div className='mt-4 h-24 animate-pulse rounded-lg bg-muted' />}>
      <Stays params={params} />
    </Suspense>
  );
}

async function Stays({ params }: Pick<Props, 'params'>) {
  const { tripId } = await params;
  const [trip, stays] = await Promise.all([getTrip(tripId), getTripStays(tripId)]);
  if (!trip) notFound();

  return (
    <StayList
      trip={{ id: trip.id, startDate: trip.start_date, endDate: trip.end_date }}
      stays={stays}
    />
  );
}
