import { useFormatter, useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getDayItems, getTrip, getTripDays, type DayItem } from '@/data/trips';
import { resolveSelectedDayIndex } from '@/lib/trip/day-selection';
import { localDateToUtc } from '@/lib/trip/trip-dates';
import { currentDayIndex, resolveTimezone } from '@/lib/trip/trip-phase';
import { DayItems } from './day-items';
import type { DayOption } from './item-form';
import { DaySelector } from './day-selector';

type Props = PageProps<'/[locale]/trips/[tripId]'>;

// 行程分頁：上方是天數列，下面是選中那一天、依時段分組的項目（Q10、Q18）。
export default function ItineraryPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<ItinerarySkeleton />}>
      <Itinerary params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Itinerary({ params, searchParams }: Props) {
  const [{ tripId }, { day: dayParam }] = await Promise.all([params, searchParams]);
  const [trip, days] = await Promise.all([getTrip(tripId), getTripDays(tripId)]);
  if (!trip || days.length === 0) notFound();

  // cacheComponents：讀過請求資料之後才能取目前時間。
  const now = new Date();
  const timezones = days.map((day) => resolveTimezone(day, trip.default_timezone));
  const todayIndex = currentDayIndex(
    days.map((day, index) => ({ date: day.date, timezone: timezones[index] })),
    now,
  );
  const selectedIndex = resolveSelectedDayIndex(
    Array.isArray(dayParam) ? dayParam[0] : dayParam,
    days.length,
    todayIndex,
  );
  const selectedDay = days[selectedIndex];
  const items = await getDayItems(selectedDay.id);

  return (
    <>
      <DaySelector
        tripId={trip.id}
        selectedIndex={selectedIndex}
        days={days.map((day, index) => ({
          date: day.date,
          city: day.city,
          isToday: index === todayIndex,
        }))}
      />
      <DayView
        dayId={selectedDay.id}
        dayOptions={days.map((day, index) => ({
          id: day.id,
          dayNumber: index + 1,
          date: day.date,
          city: day.city,
        }))}
        dayNumber={selectedIndex + 1}
        date={selectedDay.date}
        city={selectedDay.city}
        // 只有和行程預設不同時才標示當地時區，例如回程那天在台北。
        customTimezone={selectedDay.timezone !== null ? timezones[selectedIndex] : null}
        items={items}
      />
    </>
  );
}

type DayViewProps = {
  dayId: string;
  dayOptions: DayOption[];
  dayNumber: number;
  date: string;
  city: string | null;
  customTimezone: string | null;
  items: DayItem[];
};

function DayView({
  dayId,
  dayOptions,
  dayNumber,
  date,
  city,
  customTimezone,
  items,
}: DayViewProps) {
  const t = useTranslations('trips.day');
  const format = useFormatter();

  return (
    <section className='flex flex-col gap-5 pt-4' aria-labelledby='day-heading'>
      <header className='flex flex-col gap-0.5'>
        <h2 id='day-heading' className='text-lg font-semibold'>
          {t('dayNumber', { day: dayNumber })}
          <span className='ml-2 text-base font-normal text-muted-foreground'>
            {format.dateTime(localDateToUtc(date), {
              month: 'numeric',
              day: 'numeric',
              weekday: 'short',
              timeZone: 'UTC',
            })}
          </span>
        </h2>
        <p className='text-sm text-muted-foreground'>{city || t('noCity')}</p>
        {customTimezone && (
          <p className='text-xs text-muted-foreground'>
            {t('localTime', { timezone: customTimezone })}
          </p>
        )}
      </header>

      <DayItems dayId={dayId} dayOptions={dayOptions} items={items} />
    </section>
  );
}

function ItinerarySkeleton() {
  return (
    <div className='flex flex-col gap-4 pt-3' aria-hidden='true'>
      <div className='h-14 animate-pulse rounded-lg bg-muted' />
      <div className='h-24 animate-pulse rounded-lg bg-muted' />
      <div className='h-24 animate-pulse rounded-lg bg-muted' />
    </div>
  );
}
