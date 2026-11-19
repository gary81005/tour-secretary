'use client';

import { BedDoubleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DayHeading } from '@/components/itinerary/day-heading';
import { DaySelector } from '@/components/itinerary/day-selector';
import { ItemCard } from '@/components/itinerary/item-card';
import { LegLine } from '@/components/itinerary/leg-line';
import { NowCard } from '@/components/itinerary/now-card';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { planItemLegs, type DayTravel } from '@/lib/maps/legs';
import { routesSupported } from '@/lib/maps/region';
import type { OfflineSnapshot } from '@/lib/offline/snapshot';
import { resolveSelectedDayIndex } from '@/lib/trip/day-selection';
import { groupItemsBySlot, sortItems } from '@/lib/trip/item-order';
import { nowStay } from '@/lib/trip/progress';
import { staysForNight } from '@/lib/trip/stays';
import { currentDayIndex, resolveTimezone } from '@/lib/trip/trip-phase';

// 離線行程頁的「行程」分頁（ADR 0010 Q11）：和線上的單日畫面相同的天數列、「現在／下一站」與項目卡片，
// 全部唯讀。Google 的資料（營業時間、地址、移動時間）沒有存，不顯示；「查電車」、導航等連結保留，
// 有網路時可以用。切換天數只改頁面狀態，不導覽。
export function OfflineDay({ snapshot, now }: { snapshot: OfflineSnapshot; now: Date }) {
  const t = useTranslations();
  const { days, stays } = snapshot;
  const timezones = days.map((day) => resolveTimezone(day, snapshot.trip.default_timezone));
  const todayIndex = currentDayIndex(
    days.map((day, index) => ({ date: day.date, timezone: timezones[index] })),
    now,
  );
  const [selectedIndex, setSelectedIndex] = useState(() =>
    resolveSelectedDayIndex(undefined, days.length, todayIndex),
  );

  const day = days[selectedIndex];
  const timezone = timezones[selectedIndex];
  const isLastDay = selectedIndex === days.length - 1;
  const tonightStays = isLastDay ? [] : staysForNight(stays, day.date);
  // 離線時沒有住宿座標與移動時間：只規劃項目之間的段，顯示「查電車」等連結。
  const travel: DayTravel = {
    startStay: null,
    endStay: null,
    routes: routesSupported(timezone) ? { kind: 'google', durations: null } : { kind: 'korea' },
  };
  const groups = groupItemsBySlot(day.items);
  const sorted = sortItems(day.items);
  const previousIds = new Map(sorted.map((item, index) => [item.id, sorted[index - 1]?.id]));
  const legsTo = new Map(
    planItemLegs(day.items, travel).flatMap((leg) =>
      leg.to.kind === 'item' ? [[leg.to.itemId, leg] as const] : [],
    ),
  );

  return (
    <>
      <DaySelector
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        className='top-0'
        days={days.map((day, index) => ({
          date: day.date,
          city: day.city,
          isToday: index === todayIndex,
        }))}
      />
      <section className='flex flex-col gap-5 pt-4' aria-labelledby='day-heading'>
        <DayHeading
          id='day-heading'
          dayNumber={selectedIndex + 1}
          date={day.date}
          city={day.city}
          customTimezone={day.timezone !== null ? timezone : null}
        />

        {selectedIndex === todayIndex && (
          <NowCard
            items={day.items}
            stay={nowStay(tonightStays)}
            travel={travel}
            timezone={timezone}
            onDone={null}
            onReport={null}
          />
        )}

        {groups.length === 0 ? (
          <Empty className='border'>
            <EmptyHeader>
              <EmptyTitle>{t('offline.dayEmpty')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          groups.map((group) => (
            <section
              key={group.slot}
              className='flex flex-col gap-2'
              aria-labelledby={`slot-${group.slot}`}
            >
              <h3 id={`slot-${group.slot}`} className='text-sm font-medium text-muted-foreground'>
                {t(`trips.timeSlots.${group.slot}`)}
              </h3>
              <ul className='flex flex-col gap-2'>
                {group.items.map((item) => {
                  const leg = legsTo.get(item.id);
                  return (
                    <li key={item.id} className='flex flex-col gap-2'>
                      {leg && (
                        <LegLine
                          leg={leg}
                          showFrom={
                            leg.from.kind === 'stay' || leg.from.itemId !== previousIds.get(item.id)
                          }
                          routes={travel.routes}
                        />
                      )}
                      <ItemCard item={item} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        {!isLastDay && (
          <div className='flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm'>
            <BedDoubleIcon className='size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
            {tonightStays.length === 0 ? (
              <span className='text-muted-foreground'>{t('trips.stays.tonightNone')}</span>
            ) : (
              <div className='flex min-w-0 flex-col gap-0.5'>
                <span className='text-xs text-muted-foreground'>{t('trips.stays.tonight')}</span>
                {tonightStays.map((stay) => (
                  <div key={stay.id} className='break-words'>
                    {stay.name}
                    <span className='ml-1.5 text-xs text-muted-foreground'>
                      {t(`trips.stayStatus.${stay.status}`)}
                    </span>
                    {stay.address && (
                      <p className='text-xs text-muted-foreground'>{stay.address}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
