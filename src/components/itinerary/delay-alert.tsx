'use client';

import { cn } from 'cn';
import { AlarmClockIcon, CheckIcon, FootprintsIcon, MessageSquareWarningIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useTimeAlert } from '@/hooks/use-time-alert';
import type { ItemView } from '@/lib/trip/item-view';
import { toHourMinute } from '@/lib/trip/time-slot';

// 「現在／下一站」上方的落後提醒條（ADR 0009「M6 細節」），只看時間：
// - 該出發了：到了建議出發時間（沒有時用開始前 15 分鐘），「現在」的項目還沒完成
// - 已經晚了：過了下一站的開始時間，「現在」的項目還沒完成
// 按鈕「完成目前項目」「回報狀況」「知道了」；onDone、onReport 是 null 時（離線行程頁）只有「知道了」。
export function DelayAlert<T extends ItemView>({
  timezone,
  current,
  next,
  departure,
  onDone,
  onReport,
}: {
  timezone: string;
  current: T;
  next: T;
  departure: string | null;
  onDone: ((item: T) => void) | null;
  onReport: ((item: T) => void) | null;
}) {
  const t = useTranslations('trips.alert');
  const { alert, dismiss } = useTimeAlert({ timezone, current, next, departure });
  if (!alert || !next.start_time) return null;

  const late = alert.kind === 'late';
  const start = toHourMinute(next.start_time);
  const Icon = late ? AlarmClockIcon : FootprintsIcon;

  return (
    <div
      role='status'
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        late ? 'border-destructive/40 bg-destructive/10' : 'border-primary/40 bg-primary/10',
      )}
    >
      <div className='flex items-start gap-2'>
        <Icon
          className={cn('mt-0.5 size-4 shrink-0', late ? 'text-destructive' : 'text-primary')}
          aria-hidden='true'
        />
        <div className='flex min-w-0 flex-col gap-0.5'>
          <span className={cn('font-medium', late ? 'text-destructive' : 'text-primary')}>
            {t(late ? 'lateTitle' : 'leaveNowTitle')}
          </span>
          <span className='text-sm break-words'>
            {late
              ? t('late', { next: next.title, start, current: current.title })
              : departure
                ? t('leaveNowAt', { next: next.title, start, departure })
                : t('leaveNow', { next: next.title, start })}
          </span>
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        {onDone && (
          <Button size='sm' onClick={() => onDone(current)}>
            <CheckIcon />
            {t('doneCurrent')}
          </Button>
        )}
        {onReport && (
          <Button size='sm' variant='outline' onClick={() => onReport(current)}>
            <MessageSquareWarningIcon />
            {t('report')}
          </Button>
        )}
        <Button size='sm' variant='ghost' className='ml-auto' onClick={() => dismiss(next.id)}>
          {t('dismiss')}
        </Button>
      </div>
    </div>
  );
}
