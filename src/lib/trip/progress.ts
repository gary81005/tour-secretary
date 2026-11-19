import { DRIVE_WHEN_WALK_OVER_SECONDS } from '@/lib/maps/legs';
import type { PlaceRef } from '@/lib/maps/links';
import type { StayStatus } from './enums';
import { isPending } from './adjustments';
import { sortItems, type OrderableItem } from './item-order';
import { primaryStay } from './stays';
import { toHourMinute } from './time-slot';

// 旅途中的進度（ADR 0010「現在／下一站」）：項目手動按「完成」，記在 items.done_at；
// 沒去的項目記在 items.skipped_at（ADR 0009「M6 細節」），兩者都算已處理。

type ProgressItem = OrderableItem & { done_at: string | null; skipped_at: string | null };

// 今天與之前的天才能打勾；未來的天不顯示勾選框，避免誤按。
// date 是那一天的日期，today 是那一天時區的今天（都是 YYYY-MM-DD）。
export function canMarkDone(date: string, today: string): boolean {
  return date <= today;
}

// 現在＝當天第一個還沒處理（未完成、未跳過）的項目；下一站＝再下一個（依當天順序）。
// allDone：當天有項目且全部完成或跳過。
export function dayProgress<T extends ProgressItem>(
  items: readonly T[],
): { current: T | null; next: T | null; allDone: boolean } {
  const pending = sortItems(items).filter(isPending);
  return {
    current: pending[0] ?? null,
    next: pending[1] ?? null,
    allDone: items.length > 0 && pending.length === 0,
  };
}

// 樂觀更新用：把某個項目設成完成（doneAt 為時間）或未完成（null）。
// 和 setItemDone 一致：設成完成時一併取消跳過（完成和跳過只能擇一）。
export function withDone<
  T extends { id: string; done_at: string | null; skipped_at: string | null },
>(items: readonly T[], itemId: string, doneAt: string | null): T[] {
  return items.map((item) => {
    if (item.id !== itemId) return item;
    return doneAt ? { ...item, done_at: doneAt, skipped_at: null } : { ...item, done_at: null };
  });
}

// 出發前預留的緩衝時間。
export const DEPARTURE_BUFFER_MINUTES = 5;

// 建議出發時間（ADR 0010 Q10）：下一站有精確時間，且步行 30 分鐘以內時＝開始時間 − 步行時間 − 5 分鐘。
// 需要搭車的段算不出電車時間，回傳 null；算出來早於當天 00:00 時也回傳 null。
export function suggestedDeparture(startTime: string, walkSeconds: number): string | null {
  if (walkSeconds > DRIVE_WHEN_WALK_OVER_SECONDS) return null;
  const [hour, minute] = toHourMinute(startTime).split(':').map(Number);
  const departure = hour * 60 + minute - Math.ceil(walkSeconds / 60) - DEPARTURE_BUFFER_MINUTES;
  if (departure < 0) return null;
  return `${String(Math.floor(departure / 60)).padStart(2, '0')}:${String(departure % 60).padStart(2, '0')}`;
}

// 「現在／下一站」的今晚住。destination 是導航的目的地：有連結地點用地點 ID，
// 沒有時用使用者填的地址（沒填就用名稱）。
export type NowStay = { id: string; name: string; destination: PlaceRef };

export function nowStay(
  stays: readonly {
    id: string;
    name: string;
    status: StayStatus;
    address: string | null;
    place_id: string | null;
  }[],
): NowStay | null {
  const stay = primaryStay(stays);
  if (!stay) return null;
  return {
    id: stay.id,
    name: stay.name,
    destination: stay.place_id
      ? { name: stay.name, placeId: stay.place_id }
      : { name: stay.address || stay.name, placeId: null },
  };
}
