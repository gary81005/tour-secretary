'use client';

import { cn } from 'cn';
import {
  AlarmClockIcon,
  CheckIcon,
  ClockIcon,
  FootprintsIcon,
  MessageSquareWarningIcon,
  TimerIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useTimeAlert } from '@/hooks/use-time-alert';
import { suggestedDelayMinutes } from '@/lib/trip/adjustments';
import type { ItemView } from '@/lib/trip/item-view';
import { toHourMinute } from '@/lib/trip/time-slot';

// 「現在／下一站」上方的落後提醒條（ADR 0009「M6 細節」），「現在」的項目還沒完成時：
// - 已經晚了：過了下一站的開始時間
// - 會遲到（開了「用我的位置」）：從目前位置走過去會晚 15 分鐘以上；「延後之後的行程」預先帶入延後時間
// - 該出發了：到了建議出發時間（沒有時用開始前 15 分鐘）
// 按鈕「完成目前項目」「回報狀況」（會遲到時是「延後之後的行程」）「知道了」；
// onDone、onReport、onDelay 是 null 時（離線行程頁）只有「知道了」。
export function DelayAlert<T extends ItemView>({
  timezone,
  current,
  next,
  departure,
  walkSeconds,
  onDone,
  onReport,
  onDelay,
}: {
  timezone: string;
  current: T;
  next: T;
  departure: string | null;
  walkSeconds: number | null;
  onDone: ((item: T) => void) | null;
  onReport: ((item: T) => void) | null;
  // 從下一站開始延後，minutes 是預先帶入的延後時間
  onDelay: ((item: T, minutes: number) => void) | null;
}) {
  const t = useTranslations('trips.alert');
  const { alert, dismiss } = useTimeAlert({ timezone, current, next, departure, walkSeconds });
  if (!alert || !next.start_time) return null;

  const start = toHourMinute(next.start_time);
  const urgent = alert.kind !== 'leaveNow';
  const { Icon, title, message } =
    alert.kind === 'late'
      ? {
          Icon: AlarmClockIcon,
          title: t('lateTitle'),
          message: t('late', { next: next.title, start, current: current.title }),
        }
      : alert.kind === 'lateByWalk'
        ? {
            Icon: TimerIcon,
            title: t('lateByWalkTitle'),
            message: t('lateByWalk', { next: next.title, start, minutes: alert.lateMinutes }),
          }
        : {
            Icon: FootprintsIcon,
            title: t('leaveNowTitle'),
            message: departure
              ? t('leaveNowAt', { next: next.title, start, departure })
              : t('leaveNow', { next: next.title, start }),
          };

  return (
    <div
      role='status'
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        urgent ? 'border-destructive/40 bg-destructive/10' : 'border-primary/40 bg-primary/10',
      )}
    >
      <div className='flex items-start gap-2'>
        <Icon
          className={cn('mt-0.5 size-4 shrink-0', urgent ? 'text-destructive' : 'text-primary')}
          aria-hidden='true'
        />
        <div className='flex min-w-0 flex-col gap-0.5'>
          <span className={cn('font-medium', urgent ? 'text-destructive' : 'text-primary')}>
            {title}
          </span>
          <span className='text-sm break-words'>{message}</span>
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        {onDone && (
          <Button size='sm' onClick={() => onDone(current)}>
            <CheckIcon />
            {t('doneCurrent')}
          </Button>
        )}
        {alert.kind === 'lateByWalk'
          ? onDelay && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => onDelay(next, suggestedDelayMinutes(alert.lateMinutes))}
              >
                <ClockIcon />
                {t('delay')}
              </Button>
            )
          : onReport && (
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
