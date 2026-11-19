import dayjs from '@/lib/dayjs';
import { sortItems, type OrderableItem } from './item-order';
import {
  minutesToTime,
  timeSlotForTime,
  timeToMinutes,
  toHourMinute,
  type TimeSlot,
} from './time-slot';
import type { ItemCategory } from './enums';

// 調整方案（ADR 0009「M6 細節」）：工具先產生一串操作，畫面預覽差異，確認後由
// apply_trip_adjustment() 整批套用。M7 的 AI 提案也產生同樣格式的方案。

export type AdjustmentOp =
  | {
      op: 'set_time';
      item_id: string;
      // 預覽當下的 updated_at：套用時不一致（被別人改過）就整筆不套用。
      expected_updated_at: string;
      start_time: string;
      end_time: string | null;
      time_slot: TimeSlot;
    }
  | { op: 'skip'; item_id: string; expected_updated_at: string }
  | {
      op: 'add_item';
      day_id: string;
      title: string;
      time_slot: TimeSlot;
      category: ItemCategory;
      start_time: string | null;
      end_time: string | null;
      replaces_item_id: string | null;
    };

export type AdjustmentPlan = { ops: AdjustmentOp[] };

export type AdjustableItem = OrderableItem & {
  title: string;
  category: ItemCategory;
  end_time: string | null;
  done_at: string | null;
  skipped_at: string | null;
  updated_at: string;
};

// 還沒處理的項目：沒完成、沒跳過。
export function isPending(item: { done_at: string | null; skipped_at: string | null }): boolean {
  return item.done_at === null && item.skipped_at === null;
}

// ---------------------------------------------------------------------------
// 延後之後的行程（Q10）
// ---------------------------------------------------------------------------

export const DELAY_PRESETS = [15, 30, 45, 60] as const;

export type DelayPlanResult =
  | { ok: true; plan: AdjustmentPlan }
  // 延後後會超過午夜的項目（不支援跨午夜），整筆擋下
  | { ok: false; reason: 'pastMidnight'; items: { id: string; title: string }[] }
  // 從這個項目開始沒有任何有精確時間、還沒處理的項目
  | { ok: false; reason: 'nothingToDelay' };

// 從 fromItemId 開始（依當天順序），同一天之後有精確時間、還沒處理的項目都延後 minutes 分鐘。
// 原本的時段和開始時間對得上時，時段跟著新的開始時間更新；使用者特別選了別的時段（例如「整天」）就不動。
export function planDelay(
  dayItems: readonly AdjustableItem[],
  fromItemId: string,
  minutes: number,
): DelayPlanResult {
  const sorted = sortItems(dayItems);
  const fromIndex = sorted.findIndex((item) => item.id === fromItemId);
  const targets = sorted
    .slice(Math.max(fromIndex, 0))
    .filter((item) => item.start_time !== null && isPending(item));
  if (fromIndex < 0 || targets.length === 0) return { ok: false, reason: 'nothingToDelay' };

  const ops: AdjustmentOp[] = [];
  const pastMidnight: { id: string; title: string }[] = [];
  for (const item of targets) {
    const start = item.start_time as string;
    const newStart = minutesToTime(timeToMinutes(start) + minutes);
    const newEnd =
      item.end_time === null ? null : minutesToTime(timeToMinutes(item.end_time) + minutes);
    if (newStart === null || (item.end_time !== null && newEnd === null)) {
      pastMidnight.push({ id: item.id, title: item.title });
      continue;
    }
    ops.push({
      op: 'set_time',
      item_id: item.id,
      expected_updated_at: item.updated_at,
      start_time: newStart,
      end_time: newEnd,
      time_slot:
        item.time_slot === timeSlotForTime(start) ? timeSlotForTime(newStart) : item.time_slot,
    });
  }

  if (pastMidnight.length > 0) return { ok: false, reason: 'pastMidnight', items: pastMidnight };
  return { ok: true, plan: { ops } };
}

// 「會遲到」時預先帶入的延後時間：以 15 分鐘為單位無條件進位。
export function suggestedDelayMinutes(lateMinutes: number): number {
  return Math.max(Math.ceil(lateMinutes / 15), 1) * 15;
}

// ---------------------------------------------------------------------------
// 跳過、改用備案（Q5、Q13、Q14）
// ---------------------------------------------------------------------------

export function planSkip(item: AdjustableItem): AdjustmentPlan {
  return { ops: [{ op: 'skip', item_id: item.id, expected_updated_at: item.updated_at }] };
}

// 項目標題最多 200 字；備案內容最多 1000 字，超過的截掉。
// 以 UTF-16 長度計（和 zod 的 max 一致，資料庫以字元計只會更寬），也不把 emoji 切成一半。
const TITLE_MAX_LENGTH = 200;

function truncateTitle(text: string): string {
  let result = '';
  for (const char of text) {
    if (result.length + char.length > TITLE_MAX_LENGTH) break;
    result += char;
  }
  return result;
}

// 原項目跳過，同一個位置新增備案項目：標題是備案內容，時段、時間、類別沿用原項目。
export function planFallback(
  item: AdjustableItem,
  dayId: string,
  alternative: string,
): AdjustmentPlan {
  return {
    ops: [
      { op: 'skip', item_id: item.id, expected_updated_at: item.updated_at },
      {
        op: 'add_item',
        day_id: dayId,
        title: truncateTitle(alternative.trim()).trim(),
        time_slot: item.time_slot,
        category: item.category,
        start_time: item.start_time && toHourMinute(item.start_time),
        end_time: item.end_time && toHourMinute(item.end_time),
        replaces_item_id: item.id,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 差異預覽（Q11）：只列出有變動的項目，依方案的順序
// ---------------------------------------------------------------------------

export type AdjustmentChange =
  | {
      kind: 'time';
      itemId: string;
      title: string;
      from: { start: string; end: string | null };
      to: { start: string; end: string | null };
    }
  | { kind: 'skip'; itemId: string; title: string }
  | { kind: 'add'; title: string; start: string | null; end: string | null };

export function describePlan(
  plan: AdjustmentPlan,
  items: readonly AdjustableItem[],
): AdjustmentChange[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return plan.ops.flatMap((op): AdjustmentChange[] => {
    if (op.op === 'add_item') {
      return [{ kind: 'add', title: op.title, start: op.start_time, end: op.end_time }];
    }
    const item = byId.get(op.item_id);
    if (!item) return [];
    if (op.op === 'skip') return [{ kind: 'skip', itemId: item.id, title: item.title }];
    return [
      {
        kind: 'time',
        itemId: item.id,
        title: item.title,
        from: {
          start: toHourMinute(item.start_time ?? op.start_time),
          end: item.end_time && toHourMinute(item.end_time),
        },
        to: { start: op.start_time, end: op.end_time },
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// 復原上次調整（Q11）
// ---------------------------------------------------------------------------

// 與 undo_trip_adjustment() 一致：行程最近一次的調整、還沒復原、7 天內
// （之後 purge_deleted_rows 會刪掉紀錄）。latest 是行程最近一次的調整，復原過的也算。
export const UNDO_ADJUSTMENT_DAYS = 7;

export function isAdjustmentUndoable(
  latest: { created_at: string; undone_at: string | null },
  now: Date,
): boolean {
  return (
    latest.undone_at === null &&
    !dayjs.utc(latest.created_at).add(UNDO_ADJUSTMENT_DAYS, 'day').isBefore(now)
  );
}

// ---------------------------------------------------------------------------
// 落後提醒（Q8）
// ---------------------------------------------------------------------------

// 容忍時間：沒有建議出發時間時，開始前 15 分鐘算「該出發了」；預估晚 15 分鐘以上算「會遲到」。
export const LATE_TOLERANCE_MINUTES = 15;

export type TimeAlert = { kind: 'leaveNow' | 'late'; itemId: string };

// 只看時間的提醒，對象是有精確開始時間的下一站，而且「現在」的項目還沒處理：
// - 已經晚了：過了下一站的開始時間
// - 該出發了：到了建議出發時間（沒有時用開始前 15 分鐘）
// now 是那一天時區的現在時間（HH:MM）；departure 是建議出發時間（HH:MM），算不出來時是 null。
export function timeAlert(input: {
  current: { done_at: string | null; skipped_at: string | null } | null;
  next: { id: string; start_time: string | null } | null;
  now: string;
  departure: string | null;
}): TimeAlert | null {
  const { current, next, now, departure } = input;
  if (!current || !isPending(current) || !next?.start_time) return null;

  const nowMinutes = timeToMinutes(now);
  const start = timeToMinutes(next.start_time);
  if (nowMinutes >= start) return { kind: 'late', itemId: next.id };

  const leaveAt = departure ? timeToMinutes(departure) : start - LATE_TOLERANCE_MINUTES;
  if (nowMinutes >= leaveAt) return { kind: 'leaveNow', itemId: next.id };
  return null;
}

// 用定位的提醒（「會遲到」）：現在出發步行過去，會比開始時間晚幾分鐘；不到 15 分鐘或趕得上時是 null。
export function lateMinutesByWalk(
  now: string,
  walkSeconds: number,
  startTime: string,
): number | null {
  const late = timeToMinutes(now) + Math.ceil(walkSeconds / 60) - timeToMinutes(startTime);
  return late >= LATE_TOLERANCE_MINUTES ? late : null;
}

// 「用我的位置」只在下一站 2 小時內開始時定位，最多每 5 分鐘一次（ADR 0009 Q9）。
export const LOCATION_WINDOW_MINUTES = 120;
export const LOCATION_INTERVAL_MS = 5 * 60 * 1000;

// 下一站還沒開始、2 小時內開始時才需要定位（已經開始就是「已經晚了」，不用再算）。
export function shouldLocate(now: string, startTime: string): boolean {
  const minutesLeft = timeToMinutes(startTime) - timeToMinutes(now);
  return minutesLeft > 0 && minutesLeft <= LOCATION_WINDOW_MINUTES;
}

export type DelayAlert = TimeAlert | { kind: 'lateByWalk'; itemId: string; lateMinutes: number };

// 「現在／下一站」上方的提醒：已經晚了 > 會遲到（用定位）> 該出發了。
// walkSeconds 是從手機位置步行到下一站的時間（沒開「用我的位置」或算不出來時是 null）。
export function delayAlert(input: {
  current: { done_at: string | null; skipped_at: string | null } | null;
  next: { id: string; start_time: string | null } | null;
  now: string;
  departure: string | null;
  walkSeconds: number | null;
}): DelayAlert | null {
  const alert = timeAlert(input);
  const { current, next, now, walkSeconds } = input;
  if (alert?.kind === 'late' || walkSeconds === null) return alert;
  if (!current || !isPending(current) || !next?.start_time) return null;

  const lateMinutes = lateMinutesByWalk(now, walkSeconds, next.start_time);
  return lateMinutes === null ? alert : { kind: 'lateByWalk', itemId: next.id, lateMinutes };
}
