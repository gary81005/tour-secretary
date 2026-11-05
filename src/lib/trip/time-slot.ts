import { Constants, type Enums } from '@/types/database';

export type TimeSlot = Enums<'time_slot'>;
export type TimedSlot = Exclude<TimeSlot, 'all_day'>;

// 順序與資料庫 enum 相同：「整天」排最前，其餘照一天的時間先後。
export const TIME_SLOTS = Constants.public.Enums.time_slot;

// 每個時段的預設時間範圍（含開始、不含結束），用來排序與推算落後提醒。
export const TIME_SLOT_WINDOWS = {
  early_morning: { start: '05:00', end: '08:00' },
  morning: { start: '08:00', end: '11:00' },
  noon: { start: '11:00', end: '14:00' },
  afternoon: { start: '14:00', end: '17:00' },
  evening: { start: '17:00', end: '19:00' },
  night: { start: '19:00', end: '24:00' },
} as const satisfies Record<TimedSlot, { start: string; end: string }>;

const TIMED_SLOTS = TIME_SLOTS.filter((slot): slot is TimedSlot => slot !== 'all_day');

// Postgres 的 time 欄位回傳 HH:MM:SS，畫面與比較一律用 HH:MM。
export function toHourMinute(time: string): string {
  return time.slice(0, 5);
}

// 填了開始時間時自動帶入的時段。不支援跨午夜，所以 00:00–05:00 歸到「清晨」。
export function timeSlotForTime(time: string): TimedSlot {
  const hhmm = toHourMinute(time);
  return TIMED_SLOTS.find((slot) => hhmm < TIME_SLOT_WINDOWS[slot].end) ?? 'night';
}

export function timeSlotIndex(slot: TimeSlot): number {
  return TIME_SLOTS.indexOf(slot);
}
