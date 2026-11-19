'use client';

import { AlarmClockIcon, FootprintsIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTimeAlert } from '@/hooks/use-time-alert';
import { toHourMinute } from '@/lib/trip/time-slot';

// 首頁進行中的行程卡片上的落後提醒（ADR 0009「M6 細節」）：只顯示「該出發了」與「已經晚了」，
// 首頁不查移動時間也不用定位，「該出發了」一律是開始前 15 分鐘。在行程頁按過「知道了」的不再顯示。
export function TripCardAlert({
  timezone,
  current,
  next,
}: {
  timezone: string;
  current: { done_at: string | null; skipped_at: string | null };
  next: { id: string; title: string; start_time: string | null };
}) {
  const t = useTranslations('trips.alert');
  const { alert } = useTimeAlert({ timezone, current, next, departure: null });
  if (!alert || !next.start_time) return null;

  const late = alert.kind === 'late';
  const Icon = late ? AlarmClockIcon : FootprintsIcon;
  const values = { next: next.title, start: toHourMinute(next.start_time) };

  return (
    <p
      className={
        late
          ? 'flex items-center gap-1.5 text-sm font-medium text-destructive'
          : 'flex items-center gap-1.5 text-sm font-medium text-primary'
      }
    >
      <Icon className='size-3.5 shrink-0' aria-hidden='true' />
      <span className='truncate'>{t(late ? 'homeLate' : 'homeLeaveNow', values)}</span>
    </p>
  );
}
