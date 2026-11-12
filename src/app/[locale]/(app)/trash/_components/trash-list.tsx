import { Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TripDateRange } from '@/components/trip/trip-date-range';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { TrashedTrip as TrashedTripRow } from '@/data/trips';
import { TrashItemActions } from './trash-item-actions';

// daysLeft：再幾天永久刪除。
export type TrashedTrip = TrashedTripRow & { daysLeft: number };

// 垃圾桶的行程列表：每筆可以還原或永久刪除。
export function TrashListView({ trips }: { trips: TrashedTrip[] }) {
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
