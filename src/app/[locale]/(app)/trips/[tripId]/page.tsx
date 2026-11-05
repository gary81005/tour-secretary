import { ExternalLinkIcon, GitBranchIcon, MapPinIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CategoryIcon } from '@/components/trip/category-icon';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { getDayItems, getTrip, getTripDays, type DayItem } from '@/data/trips';
import { resolveSelectedDayIndex } from '@/lib/trip/day-selection';
import { groupItemsBySlot } from '@/lib/trip/item-order';
import { toHourMinute, type TimeSlot } from '@/lib/trip/time-slot';
import { localDateToUtc } from '@/lib/trip/trip-dates';
import { currentDayIndex, resolveTimezone } from '@/lib/trip/trip-phase';
import { isSafeHttpUrl } from '@/lib/url';
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
  dayNumber: number;
  date: string;
  city: string | null;
  customTimezone: string | null;
  items: DayItem[];
};

function DayView({ dayNumber, date, city, customTimezone, items }: DayViewProps) {
  const t = useTranslations('trips.day');
  const format = useFormatter();
  const groups = groupItemsBySlot(items);

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

      {groups.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map((group) => <SlotGroup key={group.slot} slot={group.slot} items={group.items} />)
      )}
    </section>
  );
}

function SlotGroup({ slot, items }: { slot: TimeSlot; items: DayItem[] }) {
  const t = useTranslations('trips.timeSlots');

  return (
    <section className='flex flex-col gap-2' aria-labelledby={`slot-${slot}`}>
      <h3 id={`slot-${slot}`} className='text-sm font-medium text-muted-foreground'>
        {t(slot)}
      </h3>
      <ul className='flex flex-col gap-2'>
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemCard({ item }: { item: DayItem }) {
  const t = useTranslations('trips');
  const time = item.start_time
    ? [item.start_time, item.end_time]
        .filter((value): value is string => !!value)
        .map(toHourMinute)
        .join('–')
    : null;

  return (
    <article className='flex gap-3 rounded-lg border bg-card p-3'>
      <div
        className='flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'
        title={t(`categories.${item.category}`)}
      >
        <CategoryIcon category={item.category} className='size-4' />
        <span className='sr-only'>{t(`categories.${item.category}`)}</span>
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <div className='flex items-baseline justify-between gap-2'>
          <h4 className='font-medium break-words'>{item.title}</h4>
          {time && (
            <span className='shrink-0 text-sm text-muted-foreground tabular-nums'>{time}</span>
          )}
        </div>

        {item.item_places.length > 0 && (
          <p className='flex items-start gap-1 text-sm text-muted-foreground'>
            <MapPinIcon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
            <span>{item.item_places.map((place) => place.name).join(' → ')}</span>
          </p>
        )}

        {item.description && (
          <p className='text-sm break-words whitespace-pre-line'>{item.description}</p>
        )}

        {isSafeHttpUrl(item.url) && (
          <a
            href={item.url}
            target='_blank'
            rel='noopener noreferrer'
            className='flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline'
          >
            <ExternalLinkIcon className='size-3.5' aria-hidden='true' />
            {t('day.openLink')}
          </a>
        )}

        {item.fallbacks.length > 0 && (
          <ul className='mt-1 flex flex-col gap-1 border-t pt-2 text-sm text-muted-foreground'>
            {item.fallbacks.map((fallback) => (
              <li key={fallback.id} className='flex items-start gap-1'>
                <GitBranchIcon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
                <span>
                  <span className='sr-only'>{t('day.fallback')}：</span>
                  {fallback.condition
                    ? t('day.fallbackWithCondition', {
                        condition: fallback.condition,
                        alternative: fallback.alternative,
                      })
                    : fallback.alternative}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
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
