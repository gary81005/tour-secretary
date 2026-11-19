'use client';

import { useSyncExternalStore } from 'react';
import { localTime } from '@/lib/trip/trip-phase';

// 每 30 秒、以及回到這個分頁時重新讀一次時間（手機鎖屏回來時馬上更新提醒）。
function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onChange);
  };
}

// 那個時區現在幾點（HH:MM），跟著時間更新。伺服器端與 hydration 時是 null：
// 時間只在瀏覽器算，避免伺服器與手機的時間不同步造成畫面不一致。
export function useLocalTime(timezone: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => localTime(timezone, new Date()),
    () => null,
  );
}
