'use client';

import { delayAlert, type DelayAlert } from '@/lib/trip/adjustments';
import { useDismissedAlerts } from './use-dismissed-alerts';
import { useLocalTime } from './use-local-time';

// 落後提醒（「該出發了」「已經晚了」，有開「用我的位置」時加上「會遲到」，ADR 0009「M6 細節」），
// 跟著時間更新；這支手機對同一站按過「知道了」的那一種提醒不再出現。伺服器端與 hydration 時是 null。
// timezone 是那一天的時區；departure 是建議出發時間，算不出來時是 null（改用開始前 15 分鐘）；
// walkSeconds 是從手機位置步行到下一站的時間，沒有時是 null。
export function useTimeAlert(input: {
  timezone: string;
  current: { done_at: string | null; skipped_at: string | null } | null;
  next: { id: string; start_time: string | null } | null;
  departure: string | null;
  walkSeconds: number | null;
}): { alert: DelayAlert | null; dismiss: (alert: DelayAlert) => void } {
  const now = useLocalTime(input.timezone);
  const { ready, isDismissed, dismiss } = useDismissedAlerts();
  if (now === null || !ready) return { alert: null, dismiss };

  const alert = delayAlert({ ...input, now });
  return { alert: alert && !isDismissed(alert) ? alert : null, dismiss };
}
