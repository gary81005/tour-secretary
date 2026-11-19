import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';
import { getDayMaps } from '@/data/day-maps';
import { isTripOwner } from '@/data/members';
import { getDayItems, getTrip, getTripDays, getTripStays } from '@/data/trips';
import { resolveSelectedDayIndex } from '@/lib/trip/day-selection';
import { canMarkDone, nowStay } from '@/lib/trip/progress';
import { staysForNight } from '@/lib/trip/stays';
import { currentDayIndex, localDate, resolveTimezone } from '@/lib/trip/trip-phase';
import { DayMenu } from './_components/day-menu';
import { DaySwitcher } from './_components/day-switcher';
import { DayView, ItinerarySkeleton } from './_components/day-view';
import { TonightStay } from './_components/tonight-stay';

type Props = PageProps<'/[locale]/trips/[tripId]'>;

const DAY_TRANSITION = { 'day-forward': 'day-forward', 'day-back': 'day-back', default: 'none' };

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
  const [items, stays, isOwner] = await Promise.all([
    getDayItems(selectedDay.id),
    getTripStays(tripId),
    isTripOwner(tripId),
  ]);
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
    <DaySwitcher
      tripId={trip.id}
      selectedIndex={selectedIndex}
      days={days.map((day, index) => ({
        date: day.date,
        city: day.city,
        isToday: index === todayIndex,
      }))}
    >
      {/* 換天時依方向滑入（DaySwitcher 帶 day-forward / day-back）；其他更新（例如打勾後重新整理）不動。 */}
      <ViewTransition
        key={selectedDay.id}
        enter={DAY_TRANSITION}
        exit={DAY_TRANSITION}
        default='none'
      >
        <DayView
          tripId={trip.id}
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
          timezone={timezone}
          customTimezone={selectedDay.timezone !== null ? timezone : null}
          items={items}
          placeSearch={maps.placeSearch}
          placeHours={maps.placeHours}
          markDone={canMarkDone(selectedDay.date, localDate(timezone, now))}
          isToday={selectedIndex === todayIndex}
          nowStay={nowStay(tonightStays)}
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
              canDeleteDay={isOwner}
            />
          }
        />
      </ViewTransition>
    </DaySwitcher>
  );
}
