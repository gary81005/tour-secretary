import type { TravelerConstraintKind } from '@/lib/trip/enums';
import { validateStayRange } from '@/lib/trip/stays';
import { countDays, MAX_TRIP_DAYS } from '@/lib/trip/trip-dates';
import { matchFallbacks } from './fallbacks';
import { hasErrors } from './issues';
import { normalizeTitle } from './schedule-cells';
import type { DraftItem, ImportDraft } from './types';

// 匯入草稿 + 目標行程 → 預覽要顯示的規劃（ADR 0008：附加與覆蓋）。
// 這裡不看使用者在預覽中的勾選與修改；那些在 selection.ts 套用。

export type ImportMode = 'new' | 'append' | 'overwrite';

// 既有行程目前的資料（都只含未刪除的）。
export type ExistingTrip = {
  startDate: string;
  endDate: string;
  days: readonly { date: string; city: string | null }[];
  items: readonly { id: string; date: string; title: string }[];
  stays: readonly { name: string; checkIn: string; checkOut: string }[];
  notes: readonly { topic: string }[];
  constraints: readonly { kind: TravelerConstraintKind; content: string }[];
};

export type ImportTarget = { mode: 'new' } | { mode: 'append' | 'overwrite'; trip: ExistingTrip };

// 備案要掛的項目：這次匯入的項目（draft key），或行程裡的既有項目（id）。
export type FallbackTarget =
  | { source: 'file'; key: string; date: string; title: string }
  | { source: 'existing'; id: string; date: string; title: string };

export type DateRange = { startDate: string; endDate: string };

export type CityChange = { date: string; from: string | null; to: string };

export type ImportPlan = {
  mode: ImportMode;
  // 匯入後的行程日期範圍；新建行程但檔案沒有日期時是 null。
  range: DateRange | null;
  // 既有行程被延長時，原本的範圍。
  extendedFrom: DateRange | null;
  // 會改掉的城市（既有的天）。
  cityChanges: CityChange[];
  // 附加模式下，檔案的城市和既有的不同、但保留既有值的天。
  cityConflicts: CityChange[];
  // 附加模式下，行程裡已經有的資料（draft key），預設不匯入。
  duplicates: ReadonlySet<string>;
  // 住宿日期不在匯入後的行程範圍內（draft key）。
  staysOutsideTrip: ReadonlySet<string>;
  // 備案自動比對的結果；null 是對不到，要在預覽選擇或略過。
  fallbackTargets: ReadonlyMap<string, FallbackTarget | null>;
  // 覆蓋模式下會被軟刪除的筆數（確認對話框用）。
  replaced: {
    dates: string[];
    items: number;
    stays: number;
    notes: number;
    constraints: number;
  } | null;
  // 擋住匯入、但與勾選無關的問題。
  blockers: PlanBlocker[];
};

export type PlanBlocker =
  { code: 'fileErrors' } | { code: 'noSchedule' } | { code: 'tooManyDays'; max: number };

const sameKey = (...parts: string[]) => parts.join('|');

export function planImport(draft: ImportDraft, target: ImportTarget): ImportPlan {
  const trip = target.mode === 'new' ? null : target.trip;
  const fileRange = draftRange(draft);
  const range = trip
    ? unionRange({ startDate: trip.startDate, endDate: trip.endDate }, fileRange)
    : fileRange;
  const extended =
    trip && range && (range.startDate < trip.startDate || range.endDate > trip.endDate);

  const blockers: PlanBlocker[] = [];
  if (hasErrors(draft.issues)) blockers.push({ code: 'fileErrors' });
  if (target.mode === 'new' && draft.days.length === 0) blockers.push({ code: 'noSchedule' });
  if (range && countDays(range.startDate, range.endDate) > MAX_TRIP_DAYS) {
    blockers.push({ code: 'tooManyDays', max: MAX_TRIP_DAYS });
  }

  return {
    mode: target.mode,
    range,
    extendedFrom: extended ? { startDate: trip.startDate, endDate: trip.endDate } : null,
    ...planCities(draft, target),
    duplicates: target.mode === 'append' ? findDuplicates(draft, target.trip) : new Set(),
    staysOutsideTrip: new Set(
      range
        ? (draft.stays ?? [])
            .filter(
              (stay) =>
                validateStayRange(
                  { check_in: stay.checkIn, check_out: stay.checkOut },
                  { start_date: range.startDate, end_date: range.endDate },
                ) !== null,
            )
            .map((stay) => stay.key)
        : [],
    ),
    fallbackTargets: planFallbacks(draft, target),
    replaced: target.mode === 'overwrite' ? planReplaced(draft, target.trip) : null,
    blockers,
  };
}

function draftRange(draft: ImportDraft): DateRange | null {
  if (draft.days.length === 0) return null;
  // 解析時已確認日期遞增。
  return { startDate: draft.days[0].date, endDate: draft.days.at(-1)!.date };
}

function unionRange(a: DateRange, b: DateRange | null): DateRange {
  if (!b) return a;
  return {
    startDate: a.startDate < b.startDate ? a.startDate : b.startDate,
    endDate: a.endDate > b.endDate ? a.endDate : b.endDate,
  };
}

function planCities(
  draft: ImportDraft,
  target: ImportTarget,
): Pick<ImportPlan, 'cityChanges' | 'cityConflicts'> {
  const cityChanges: CityChange[] = [];
  const cityConflicts: CityChange[] = [];
  if (target.mode === 'new') return { cityChanges, cityConflicts };

  const existing = new Map(target.trip.days.map((day) => [day.date, day.city]));
  for (const day of draft.days) {
    // 延長出來的新天不算「改掉」；檔案沒寫城市的天不動。
    if (!day.city || !existing.has(day.date)) continue;
    const current = existing.get(day.date) ?? null;
    if (current === day.city) continue;
    const change = { date: day.date, from: current, to: day.city };
    if (target.mode === 'overwrite' || current === null) cityChanges.push(change);
    else cityConflicts.push(change);
  }
  return { cityChanges, cityConflicts };
}

function findDuplicates(draft: ImportDraft, trip: ExistingTrip): Set<string> {
  const items = new Set(trip.items.map((item) => sameKey(item.date, normalizeTitle(item.title))));
  const stays = new Set(
    trip.stays.map((stay) => sameKey(normalizeTitle(stay.name), stay.checkIn, stay.checkOut)),
  );
  const notes = new Set(trip.notes.map((note) => normalizeTitle(note.topic)));
  const constraints = new Set(
    trip.constraints.map((c) => sameKey(c.kind, normalizeTitle(c.content))),
  );

  return new Set([
    ...draft.items
      .filter((item) => items.has(sameKey(item.date, normalizeTitle(item.title))))
      .map((item) => item.key),
    ...(draft.stays ?? [])
      .filter((stay) => stays.has(sameKey(normalizeTitle(stay.name), stay.checkIn, stay.checkOut)))
      .map((stay) => stay.key),
    ...(draft.notes ?? [])
      .filter((note) => notes.has(normalizeTitle(note.topic)))
      .map((note) => note.key),
    ...(draft.constraints ?? [])
      .filter((c) => constraints.has(sameKey(c.kind, normalizeTitle(c.content))))
      .map((c) => c.key),
  ]);
}

function planFallbacks(
  draft: ImportDraft,
  target: ImportTarget,
): Map<string, FallbackTarget | null> {
  return matchFallbacks(draft.fallbacks ?? [], fallbackCandidates(draft, target));
}

// 備案可以掛的項目，也是預覽中改選的選項：檔案裡的項目優先；附加模式再加上行程裡的既有項目（Q16）。
// 覆蓋模式只用檔案：檔案涵蓋的日期，既有項目會被換掉。
export function fallbackCandidates(draft: ImportDraft, target: ImportTarget): FallbackTarget[] {
  const candidates = draft.items.map((item) => fileTarget(item));
  if (target.mode === 'append') {
    candidates.push(...target.trip.items.map((item) => existingTarget(item)));
  }
  return candidates;
}

export function fileTarget(item: DraftItem): FallbackTarget {
  return { source: 'file', key: item.key, date: item.date, title: item.title };
}

export function existingTarget(item: ExistingTrip['items'][number]): FallbackTarget {
  return { source: 'existing', id: item.id, date: item.date, title: item.title };
}

function planReplaced(draft: ImportDraft, trip: ExistingTrip): NonNullable<ImportPlan['replaced']> {
  const dates = new Set(draft.days.map((day) => day.date));
  return {
    dates: trip.days.map((day) => day.date).filter((date) => dates.has(date)),
    items: trip.items.filter((item) => dates.has(item.date)).length,
    stays: draft.stays ? trip.stays.length : 0,
    notes: draft.notes ? trip.notes.length : 0,
    constraints: draft.constraints ? trip.constraints.length : 0,
  };
}
