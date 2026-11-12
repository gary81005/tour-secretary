import { BedDoubleIcon, RouteIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { GoogleAddress, type PlaceAddresses } from '@/components/maps/google-address';
import type { PlaceSearchContext } from '@/components/maps/place-search-input';
import { getDayItems, getTrip, getTripDays, getTripStays, type DayItem } from '@/data/trips';
import { Link } from '@/i18n/navigation';
import type { DayTravel } from '@/lib/maps/legs';
import type { StayStatus } from '@/lib/trip/enums';
import { resolveSelectedDayIndex } from '@/lib/trip/day-selection';
import { staysForNight } from '@/lib/trip/stays';
import { localDateToUtc } from '@/lib/trip/trip-dates';
import { currentDayIndex, resolveTimezone } from '@/lib/trip/trip-phase';
import { DayItems } from './day-items';
import { getDayMaps } from './day-maps';
import type { ItemPlaceHours } from './item-card';
import { DayMenu } from './day-menu';
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
  const [items, stays] = await Promise.all([getDayItems(selectedDay.id), getTripStays(tripId)]);
  // 最後一天是回程日，不需要住宿。
  const isLastDay = selectedIndex === days.length - 1;
  const timezone = timezones[selectedIndex];
  const tonightStays = isLastDay ? [] : staysForNight(stays, selectedDay.date);
  const maps = getDayMaps({
    items,
    stays,
    tonightStays,
    date: selectedDay.date,
    timezone,
    isLastDay,
    now,
  });

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
        customTimezone={selectedDay.timezone !== null ? timezone : null}
        items={items}
        placeSearch={maps.placeSearch}
        placeHours={maps.placeHours}
        routeUrl={maps.routeUrl}
        travel={maps.travel}
        googleAttribution={maps.googleAttribution}
        tonight={
          isLastDay ? null : (
            <TonightStay
              tripId={trip.id}
              stays={tonightStays.map((stay) => ({
                id: stay.id,
                name: stay.name,
                status: stay.status,
                placeId: stay.address ? null : stay.place_id,
              }))}
              addresses={maps.addresses}
            />
          )
        }
        menu={
          <DayMenu
            tripId={trip.id}
            day={{
              id: selectedDay.id,
              dayNumber: selectedIndex + 1,
              date: selectedDay.date,
              city: selectedDay.city,
              timezone: selectedDay.timezone,
            }}
            laterDays={days
              .slice(selectedIndex + 1)
              .map((day, offset) => ({ dayNumber: selectedIndex + 2 + offset, date: day.date }))}
            dayCount={days.length}
            itemCount={items.length}
            defaultTimezone={trip.default_timezone}
          />
        }
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
  placeSearch: PlaceSearchContext | null;
  placeHours: ItemPlaceHours | null;
  routeUrl: string | null;
  travel: DayTravel;
  googleAttribution: boolean;
  tonight: ReactNode;
  menu: ReactNode;
};

function DayView({
  dayId,
  dayOptions,
  dayNumber,
  date,
  city,
  customTimezone,
  items,
  placeSearch,
  placeHours,
  routeUrl,
  travel,
  googleAttribution,
  tonight,
  menu,
}: DayViewProps) {
  const t = useTranslations('trips.day');
  const format = useFormatter();

  return (
    <section className='flex flex-col gap-5 pt-4' aria-labelledby='day-heading'>
      <header className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-col gap-0.5'>
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
        </div>
        {menu}
      </header>

      <DayItems
        dayId={dayId}
        dayOptions={dayOptions}
        items={items}
        placeSearch={placeSearch}
        placeHours={placeHours}
        travel={travel}
        tonight={tonight}
      />
      {googleAttribution && <GoogleAttribution />}
    </section>
  );
}

// 單日畫面最下方的「今晚住」（Q8），由住宿日期推算；點了到住宿分頁。
// placeId：沒寫地址、有連結地點時才有，用來顯示 Google 的地址。
// 整塊可以點：連結用 after: 蓋住整塊，地址的語言切換按鈕再浮到上層（連結裡不能放按鈕）。
function TonightStay({
  tripId,
  stays,
  addresses,
}: {
  tripId: string;
  stays: { id: string; name: string; status: StayStatus; placeId: string | null }[];
  addresses: PlaceAddresses | null;
}) {
  const t = useTranslations('trips');
  const coverLink = 'outline-none after:absolute after:inset-0 after:rounded-lg';

  return (
    <div className='relative flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors hover:bg-muted/50 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50'>
      <BedDoubleIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
      {stays.length === 0 ? (
        <Link href={`/trips/${tripId}/stays`} className={`text-muted-foreground ${coverLink}`}>
          {t('stays.tonightNone')}
        </Link>
      ) : (
        <div className='flex min-w-0 flex-col gap-0.5'>
          <Link
            href={`/trips/${tripId}/stays`}
            className={`text-xs text-muted-foreground ${coverLink}`}
          >
            {t('stays.tonight')}
          </Link>
          {stays.map((stay) => (
            <div key={stay.id} className='break-words'>
              {stay.name}
              <span className='ml-1.5 text-xs text-muted-foreground'>
                {t(`stayStatus.${stay.status}`)}
              </span>
              {addresses && stay.placeId && (
                <GoogleAddress addresses={addresses} placeId={stay.placeId} className='text-xs' />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoogleAttribution() {
  const t = useTranslations('trips.place');
  return <p className='text-right text-xs text-muted-foreground'>{t('attribution')}</p>;
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
