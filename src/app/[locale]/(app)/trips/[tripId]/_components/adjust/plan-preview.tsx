'use client';

import { ArrowRightIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { AdjustmentChange } from '@/lib/trip/adjustments';

// 調整方案的預覽（ADR 0009 Q11）：只列出有變動的項目。
// 改時間「淺草寺 10:00 → 10:30」、跳過的加刪除線與「沒去」、新增的標「備案」。
export function PlanPreview({ changes }: { changes: AdjustmentChange[] }) {
  const t = useTranslations('trips.adjust');

  return (
    <section className='flex flex-col gap-2' aria-labelledby='plan-preview-heading'>
      <h3 id='plan-preview-heading' className='text-sm font-medium text-muted-foreground'>
        {t('previewTitle')}
      </h3>
      <ul className='flex flex-col divide-y rounded-lg border'>
        {changes.map((change, index) => (
          <li key={index} className='flex flex-wrap items-baseline gap-x-2 gap-y-1 p-3'>
            <ChangeRow change={change} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangeRow({ change }: { change: AdjustmentChange }) {
  const t = useTranslations('trips');

  switch (change.kind) {
    case 'time':
      return (
        <>
          <span className='min-w-0 flex-1 font-medium break-words'>{change.title}</span>
          <span className='flex items-center gap-1 text-sm tabular-nums'>
            <span className='text-muted-foreground'>{formatRange(change.from)}</span>
            <ArrowRightIcon
              className='size-3.5 text-muted-foreground'
              aria-label={t('adjust.to')}
            />
            <span className='font-medium text-primary'>{formatRange(change.to)}</span>
          </span>
        </>
      );
    case 'skip':
      return (
        <>
          <span className='min-w-0 flex-1 break-words text-muted-foreground line-through'>
            {change.title}
          </span>
          <Badge variant='outline'>{t('item.skipped')}</Badge>
        </>
      );
    case 'add':
      return (
        <>
          <span className='min-w-0 flex-1 font-medium break-words'>{change.title}</span>
          {change.start && (
            <span className='text-sm text-muted-foreground tabular-nums'>
              {formatRange({ start: change.start, end: change.end })}
            </span>
          )}
          <Badge variant='secondary'>{t('item.fallbackItem')}</Badge>
        </>
      );
  }
}

function formatRange({ start, end }: { start: string; end: string | null }): string {
  return end ? `${start}–${end}` : start;
}
