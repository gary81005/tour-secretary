'use client';

import { useEffect, useState } from 'react';
import { estimateWalk } from '@/actions/routes';
import { LOCATION_INTERVAL_MS, shouldLocate } from '@/lib/trip/adjustments';
import { setLocationSetting, useLocationSetting } from './use-location-setting';
import { useLocalTime } from './use-local-time';

// 「用我的位置」的狀態（ADR 0009「M6 細節」）：
// - waiting：開著，但下一站不在 2 小時內開始，先不定位
// - needsPermission：開著，但這次打開頁面還沒取得權限（打開頁面時不主動詢問，要使用者按一下）
// - locating：定位與計算中
// - walk：從目前位置步行到下一站的秒數
// - error：拒絕權限、定位失敗、下一站沒有連結地點、太遠要搭車，或地圖服務出錯：改回只看時間判斷
export type WalkStatus =
  | { kind: 'off' }
  | { kind: 'waiting' }
  | { kind: 'needsPermission' }
  | { kind: 'locating' }
  | { kind: 'walk'; walkSeconds: number }
  | { kind: 'error'; reason: 'denied' | 'unavailable' | 'noPlace' | 'tooFar' };

type Next = { id: string; start_time: string | null };

// 瀏覽器已經允許定位時才自動定位；不支援 Permissions API 時當作還沒允許。
async function permissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 15_000,
      maximumAge: 60_000,
    }),
  );
}

// 下一站有精確開始時間、2 小時內開始時，每 5 分鐘用手機位置算一次步行時間。
// available：有地圖金鑰而且不在韓國（Google 算得出步行時間）。
export function useWalkEstimate({
  next,
  timezone,
  available,
}: {
  next: Next | null;
  timezone: string;
  available: boolean;
}) {
  const on = useLocationSetting();
  const now = useLocalTime(timezone);
  // 這次打開頁面使用者按過開關或「允許定位」：可以跳出權限詢問。
  const [asked, setAsked] = useState(false);
  const [result, setResult] = useState<{ itemId: string; status: WalkStatus } | null>(null);

  const itemId = next?.id ?? null;
  const active =
    available &&
    on &&
    itemId !== null &&
    !!next?.start_time &&
    now !== null &&
    shouldLocate(now, next.start_time);

  useEffect(() => {
    if (!active || !itemId) return;
    let cancelled = false;
    const report = (status: WalkStatus) => {
      if (!cancelled) setResult({ itemId, status });
    };

    async function locate(id: string) {
      if (!asked && !(await permissionGranted())) {
        report({ kind: 'needsPermission' });
        return;
      }
      // 重新定位時保留上一次的步行時間，「會遲到」提醒不會每 5 分鐘消失一下。
      if (!cancelled) {
        setResult((previous) =>
          previous?.itemId === id && previous.status.kind === 'walk'
            ? previous
            : { itemId: id, status: { kind: 'locating' } },
        );
      }
      try {
        const { coords } = await currentPosition();
        const estimate = await estimateWalk(id, { lat: coords.latitude, lng: coords.longitude });
        report(
          estimate.ok
            ? { kind: 'walk', walkSeconds: estimate.walkSeconds }
            : { kind: 'error', reason: estimate.reason },
        );
      } catch (error) {
        const denied =
          typeof GeolocationPositionError !== 'undefined' &&
          error instanceof GeolocationPositionError &&
          error.code === error.PERMISSION_DENIED;
        report({ kind: 'error', reason: denied ? 'denied' : 'unavailable' });
      }
    }

    void locate(itemId);
    const timer = setInterval(() => void locate(itemId), LOCATION_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      // 關掉開關、離開 2 小時範圍或換下一站：舊的步行時間不再用，下次重新定位。
      setResult(null);
    };
  }, [active, itemId, asked]);

  const status: WalkStatus = !on
    ? { kind: 'off' }
    : !active
      ? { kind: 'waiting' }
      : result?.itemId === itemId
        ? result.status
        : { kind: 'locating' };

  return {
    on,
    status,
    walkSeconds: status.kind === 'walk' ? status.walkSeconds : null,
    toggle() {
      setLocationSetting(!on);
      if (!on) setAsked(true);
    },
    allow() {
      setAsked(true);
    },
  };
}
