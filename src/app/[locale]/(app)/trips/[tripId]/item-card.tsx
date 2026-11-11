'use client';

import { ExternalLinkIcon, GitBranchIcon, MapPinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, use, type ReactNode } from 'react';
import { CategoryIcon } from '@/components/trip/category-icon';
import { Badge } from '@/components/ui/badge';
import type { DayItem } from '@/data/trips';
import { googlePlaceUrl } from '@/lib/maps/links';
import { formatHoursRange, isAllDay, type PlaceHours } from '@/lib/maps/opening-hours';
import { toHourMinute } from '@/lib/trip/time-slot';
import { isSafeHttpUrl } from '@/lib/url';

// 行程項目卡片。整張卡可以點開編輯：標題按鈕用 after: 蓋住整張卡，
// 卡片裡的連結與拖拉把手再用 relative z-10 浮到上層，避免在 <button> 裡放互動元素。
// handle：左側的拖拉把手，或有精確時間時的時鐘圖示（Q22）。
// placeHours：伺服器查營業時間的 Promise（以 item_places.id 對應），沒有地圖金鑰時是 null。
export function ItemCard({
  item,
  onEdit,
  handle,
  placeHours,
}: {
  item: DayItem;
  onEdit: () => void;
  handle?: ReactNode;
  placeHours: ItemPlaceHours | null;
}) {
  const t = useTranslations('trips');
  const time = item.start_time
    ? [item.start_time, item.end_time]
        .filter((value): value is string => !!value)
        .map(toHourMinute)
        .join('–')
    : null;

  return (
    <article className='relative flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50'>
      {handle}
      <div
        className='flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'
        title={t(`categories.${item.category}`)}
      >
        <CategoryIcon category={item.category} className='size-4' />
        <span className='sr-only'>{t(`categories.${item.category}`)}</span>
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <div className='flex items-baseline justify-between gap-2'>
          <h4 className='font-medium break-words'>
            <button
              type='button'
              onClick={onEdit}
              aria-label={t('item.edit', { title: item.title })}
              className='text-left outline-none after:absolute after:inset-0 after:rounded-lg'
            >
              {item.title}
            </button>
          </h4>
          {time && (
            <span className='shrink-0 text-sm text-muted-foreground tabular-nums'>{time}</span>
          )}
        </div>

        {/* 每個地點都能在 Google 地圖開啟（只有文字的地點用名稱搜尋，不需要金鑰）。 */}
        {item.item_places.length > 0 && (
          <ul className='flex flex-col gap-0.5 text-sm text-muted-foreground'>
            {item.item_places.map((place) => (
              <li key={place.id} className='flex flex-wrap items-center gap-x-2 gap-y-0.5'>
                <a
                  href={googlePlaceUrl({ name: place.name, placeId: place.place_id })}
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-label={t('day.openPlaceInMaps', { name: place.name })}
                  className='relative z-10 flex min-w-0 items-start gap-1 underline-offset-4 hover:underline'
                >
                  <MapPinIcon className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
                  <span className='break-words'>{place.name}</span>
                </a>
                {placeHours && place.place_id && (
                  <Suspense fallback={null}>
                    <PlaceHoursInfo placeHours={placeHours} itemPlaceId={place.id} />
                  </Suspense>
                )}
              </li>
            ))}
          </ul>
        )}

        {item.description && (
          <p className='text-sm break-words whitespace-pre-line'>{item.description}</p>
        )}

        {isSafeHttpUrl(item.url) && (
          <a
            href={item.url}
            target='_blank'
            rel='noopener noreferrer'
            className='relative z-10 flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline'
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

export type ItemPlaceHours = Promise<Record<string, PlaceHours>>;

// 地點後面的營業時間與標記（ADR 0006 Q8）：「營業 09:00–17:00」「當天公休」「可能未營業」…
function PlaceHoursInfo({
  placeHours,
  itemPlaceId,
}: {
  placeHours: ItemPlaceHours;
  itemPlaceId: string;
}) {
  const t = useTranslations('trips.place');
  const info = use(placeHours)[itemPlaceId];
  if (!info) return null;

  const ranges = info.ranges ?? [];
  const hours = ranges.some(isAllDay) ? t('allDay') : ranges.map(formatHoursRange).join('、');

  return (
    <>
      {hours && <span className='text-xs tabular-nums'>{t('hours', { hours })}</span>}
      {info.status && (
        <Badge variant={info.status === 'maybeClosed' ? 'outline' : 'destructive'}>
          {t(`status.${info.status}`)}
        </Badge>
      )}
    </>
  );
}
