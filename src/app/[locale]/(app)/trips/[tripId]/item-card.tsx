'use client';

import { ExternalLinkIcon, GitBranchIcon, MapPinIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CategoryIcon } from '@/components/trip/category-icon';
import type { DayItem } from '@/data/trips';
import { toHourMinute } from '@/lib/trip/time-slot';
import { isSafeHttpUrl } from '@/lib/url';

// 行程項目卡片。整張卡可以點開編輯：標題按鈕用 after: 蓋住整張卡，
// 卡片裡的連結再用 relative z-10 浮到上層，避免在 <button> 裡放互動元素。
export function ItemCard({ item, onEdit }: { item: DayItem; onEdit: () => void }) {
  const t = useTranslations('trips');
  const time = item.start_time
    ? [item.start_time, item.end_time]
        .filter((value): value is string => !!value)
        .map(toHourMinute)
        .join('–')
    : null;

  return (
    <article className='relative flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50'>
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
