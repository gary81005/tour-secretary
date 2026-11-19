'use client';

import { timeAlert, type TimeAlert } from '@/lib/trip/adjustments';
import { useDismissedAlerts } from './use-dismissed-alerts';
import { useLocalTime } from './use-local-time';

// 只看時間的落後提醒（「該出發了」「已經晚了」，ADR 0009「M6 細節」），跟著時間更新；
// 這支手機按過「知道了」的下一站不再提醒。伺服器端與 hydration 時是 null。
// timezone 是那一天的時區；departure 是建議出發時間，算不出來時是 null（改用開始前 15 分鐘）。
export function useTimeAlert(input: {
  timezone: string;
  current: { done_at: string | null; skipped_at: string | null } | null;
  next: { id: string; start_time: string | null } | null;
  departure: string | null;
}): { alert: TimeAlert | null; dismiss: (itemId: string) => void } {
  const now = useLocalTime(input.timezone);
  const { ready, isDismissed, dismiss } = useDismissedAlerts();
  if (now === null || !ready) return { alert: null, dismiss };

  const alert = timeAlert({ ...input, now });
  return { alert: alert && !isDismissed(alert.itemId) ? alert : null, dismiss };
}
