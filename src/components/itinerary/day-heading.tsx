import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { localDateToUtc } from '@/lib/trip/trip-dates';

// 單日畫面的標題：第幾天、日期、城市；時區和行程預設不同時標示當地時區。
// id 給外層 section 的 aria-labelledby；children 放在下方（例如當天路線連結）。
export function DayHeading({
  id,
  dayNumber,
  date,
  city,
  customTimezone,
  children,
}: {
  id: string;
  dayNumber: number;
  date: string;
  city: string | null;
  customTimezone: string | null;
  children?: ReactNode;
}) {
  const t = useTranslations('trips.day');
  const format = useFormatter();

  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <h2 id={id} className='text-lg font-semibold'>
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
      {children}
    </div>
  );
}
