import { TIME_SLOTS, timeSlotIndex, toHourMinute, type TimeSlot } from './time-slot';

export type OrderableItem = {
  id: string;
  time_slot: TimeSlot;
  start_time: string | null;
  position: number;
};

// 同一天的排序規則（Q6、Q22）：
// 1. 依時段（整天 → 清晨 → … → 晚上）
// 2. 同時段內，有精確時間的排前面並照時間排
// 3. 沒有時間的照手動順序（position）
export function compareItems(a: OrderableItem, b: OrderableItem): number {
  const bySlot = timeSlotIndex(a.time_slot) - timeSlotIndex(b.time_slot);
  if (bySlot !== 0) return bySlot;

  if (a.start_time && b.start_time) {
    const byTime = toHourMinute(a.start_time).localeCompare(toHourMinute(b.start_time));
    if (byTime !== 0) return byTime;
  } else if (a.start_time) {
    return -1;
  } else if (b.start_time) {
    return 1;
  }

  return a.position - b.position || a.id.localeCompare(b.id);
}

export function sortItems<T extends OrderableItem>(items: readonly T[]): T[] {
  return items.toSorted(compareItems);
}

// 單日畫面依時段分組，只回傳有項目的時段（Q18）。
export function groupItemsBySlot<T extends OrderableItem>(
  items: readonly T[],
): { slot: TimeSlot; items: T[] }[] {
  const sorted = sortItems(items);
  return TIME_SLOTS.map((slot) => ({
    slot,
    items: sorted.filter((item) => item.time_slot === slot),
  })).filter((group) => group.items.length > 0);
}

// 拖拉排序的樂觀更新（與 reorder_items RPC 相同的規則）：
// orderedIds 依序設成 slot、position 0..n；其他項目不動。
export function applySlotOrder<T extends OrderableItem>(
  items: readonly T[],
  slot: TimeSlot,
  orderedIds: readonly string[],
): T[] {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  return items.map((item) => {
    const position = positions.get(item.id);
    return position === undefined ? item : { ...item, time_slot: slot, position };
  });
}

// 每個時段裡可以拖的項目（沒有精確時間），依目前順序。拖拉時的初始狀態。
export function untimedIdsBySlot(
  items: readonly OrderableItem[],
): Partial<Record<TimeSlot, string[]>> {
  const result: Partial<Record<TimeSlot, string[]>> = {};
  for (const group of groupItemsBySlot(items)) {
    result[group.slot] = group.items.filter((item) => !item.start_time).map((item) => item.id);
  }
  return result;
}
