'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import { localDateToUtc } from '@/lib/trip/trip-dates';

type DaySummary = { date: string; city: string | null; isToday: boolean };

type Props = {
  tripId: string;
  selectedIndex: number;
  days: DaySummary[];
};

// 可以橫向捲動的天數列（Q10）。捲動時固定在頂部列下方；切換天數只改 ?day=N，不捲回頁首。
export function DaySelector({ tripId, selectedIndex, days }: Props) {
  const t = useTranslations('trips.day');
  const format = useFormatter();
  const selectedRef = useRef<HTMLAnchorElement>(null);

  // 選中的那一天捲到看得到的位置（例如直接開 ?day=8，或今天是第 8 天）。
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selectedIndex]);

  return (
    <nav
      aria-label={t('selectorLabel')}
      className='sticky top-14 z-30 -mx-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
    >
      <ol className='flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 py-2'>
        {days.map((day, index) => {
          const isSelected = index === selectedIndex;
          return (
            <li key={day.date} className='shrink-0'>
              <Link
                ref={isSelected ? selectedRef : undefined}
                href={{ pathname: `/trips/${tripId}`, query: { day: index + 1 } }}
                scroll={false}
                replace
                aria-current={isSelected ? 'date' : undefined}
                className='flex min-w-16 flex-col items-center rounded-lg border px-3 py-1.5 text-center outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=date]:border-primary aria-[current=date]:bg-primary aria-[current=date]:text-primary-foreground'
              >
                <span className='text-xs font-medium'>
                  {day.isToday ? t('today') : t('dayNumber', { day: index + 1 })}
                </span>
                <span className='text-sm tabular-nums'>
                  {format.dateTime(localDateToUtc(day.date), {
                    month: 'numeric',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
                {day.city && <span className='max-w-20 truncate text-xs'>{day.city}</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
