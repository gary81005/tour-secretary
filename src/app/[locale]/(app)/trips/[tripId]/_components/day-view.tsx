import { RouteIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DayHeading } from '@/components/itinerary/day-heading';
import type { DayItem } from '@/data/trips';
import type { DayTravel } from '@/lib/maps/legs';
import type { ItemPlaceHours } from '@/lib/maps/opening-hours';
import type { PlaceSearchContext } from '@/lib/maps/types';
import type { NowStay } from '@/lib/trip/progress';
import { DayItems } from './day-items';
import type { DayOption } from './item-form';
import { GoogleMapsAttribution } from './maps/google-maps-attribution';

// 行程分頁選中的那一天：標題（第幾天、日期、城市、時區）、當天路線連結、項目列表。
export type DayViewProps = {
  tripId: string;
  dayId: string;
  dayOptions: DayOption[];
  dayNumber: number;
  date: string;
  city: string | null;
  customTimezone: string | null;
  items: DayItem[];
  placeSearch: PlaceSearchContext | null;
  placeHours: ItemPlaceHours | null;
  markDone: boolean;
  isToday: boolean;
  nowStay: NowStay | null;
  routeUrl: string | null;
  travel: DayTravel;
  googleAttribution: boolean;
  tonight: ReactNode;
  menu: ReactNode;
};

export function DayView({
  tripId,
  dayId,
  dayOptions,
  dayNumber,
  date,
  city,
  customTimezone,
  items,
  placeSearch,
  placeHours,
  markDone,
  isToday,
  nowStay,
  routeUrl,
  travel,
  googleAttribution,
  tonight,
  menu,
}: DayViewProps) {
  const t = useTranslations('trips.day');

  return (
    <section className='flex flex-col gap-5 pt-4' aria-labelledby='day-heading'>
      <header className='flex items-start justify-between gap-3'>
        <DayHeading
          id='day-heading'
          dayNumber={dayNumber}
          date={date}
          city={city}
          customTimezone={customTimezone}
        >
          {routeUrl && (
            <a
              href={routeUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='mt-1 flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline'
            >
              <RouteIcon className='size-3.5' aria-hidden='true' />
              {t('dayRoute')}
            </a>
          )}
        </DayHeading>
        {menu}
      </header>

      <DayItems
        tripId={tripId}
        dayId={dayId}
        dayOptions={dayOptions}
        items={items}
        placeSearch={placeSearch}
        placeHours={placeHours}
        markDone={markDone}
        isToday={isToday}
        nowStay={nowStay}
        travel={travel}
        tonight={tonight}
      />
      {googleAttribution && <GoogleMapsAttribution />}
    </section>
  );
}

export function ItinerarySkeleton() {
  return (
    <div className='flex flex-col gap-4 pt-3' aria-hidden='true'>
      <div className='h-14 animate-pulse rounded-lg bg-muted' />
      <div className='h-24 animate-pulse rounded-lg bg-muted' />
      <div className='h-24 animate-pulse rounded-lg bg-muted' />
    </div>
  );
}
