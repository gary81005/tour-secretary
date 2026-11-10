import type { ItemCategory, StayStatus, TravelerConstraintKind } from '@/lib/trip/enums';
import type { TimeSlot } from '@/lib/trip/time-slot';
import type { FallbackTarget, ImportPlan, PlanBlocker } from './plan';
import type { ImportDraft } from './types';

// 預覽中的勾選與修改（ADR 0008 Q9），以及送給 import_trip 的資料。

export type ItemOverride = { timeSlot?: TimeSlot; category?: ItemCategory };

export type ImportSelection = {
  // 不匯入的列（draft key）。
  excluded: ReadonlySet<string>;
  itemOverrides: ReadonlyMap<string, ItemOverride>;
  // 使用者為備案改選的項目（null 是清掉選擇）。不匯入某筆備案是放進 excluded。
  fallbackTargets: ReadonlyMap<string, FallbackTarget | null>;
};

// 附加模式下已存在的資料預設不勾（Q13）。
export function initialSelection(plan: ImportPlan): ImportSelection {
  return {
    excluded: new Set(plan.duplicates),
    itemOverrides: new Map(),
    fallbackTargets: new Map(),
  };
}

// 備案實際要掛的項目：使用者改選的優先，否則用自動比對的結果。
// 掛到「這次不匯入」的項目時視同沒有對到。
export function resolveFallbackTarget(
  key: string,
  plan: ImportPlan,
  selection: ImportSelection,
): FallbackTarget | null {
  const target = selection.fallbackTargets.has(key)
    ? (selection.fallbackTargets.get(key) ?? null)
    : (plan.fallbackTargets.get(key) ?? null);
  if (target?.source === 'file' && selection.excluded.has(target.key)) return null;
  return target;
}

// 預覽中的修改：每次回傳新的 selection（React state 不能原地修改）。
export function setIncluded(
  selection: ImportSelection,
  key: string,
  included: boolean,
): ImportSelection {
  const excluded = new Set(selection.excluded);
  if (included) excluded.delete(key);
  else excluded.add(key);
  return { ...selection, excluded };
}

export function setItemOverride(
  selection: ImportSelection,
  key: string,
  override: ItemOverride,
): ImportSelection {
  const itemOverrides = new Map(selection.itemOverrides);
  itemOverrides.set(key, { ...itemOverrides.get(key), ...override });
  return { ...selection, itemOverrides };
}

export function setFallbackTarget(
  selection: ImportSelection,
  key: string,
  target: FallbackTarget | null,
): ImportSelection {
  const fallbackTargets = new Map(selection.fallbackTargets);
  fallbackTargets.set(key, target);
  return { ...selection, fallbackTargets };
}

// 每一類（項目、備案、住宿、提醒事項、旅伴限制）一次最多匯入的筆數，與 import_trip 的項目上限一致。
// 橫向的每日行程最多 2000 列 × 60 天，所以要另外檢查。
export const MAX_IMPORT_ROWS = 2000;

// Server Action 的請求上限是 1 MB（next.config 的 serverActions.bodySizeLimit 預設值），
// 留一些空間給請求本身的編碼。
export const MAX_PAYLOAD_BYTES = 900_000;

export function payloadBytes(payload: ImportPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

export type ImportBlocker =
  | PlanBlocker
  | { code: 'stayOutsideTrip'; key: string }
  | { code: 'fallbackUnresolved'; key: string }
  | { code: 'tooManyRows'; max: number }
  | { code: 'tooLarge' }
  | { code: 'nothingToImport' };

// 擋住匯入的原因；空陣列才能按「確認匯入」。
export function importBlockers(
  draft: ImportDraft,
  plan: ImportPlan,
  selection: ImportSelection,
): ImportBlocker[] {
  const included = <T extends { key: string }>(rows: readonly T[] | null) =>
    (rows ?? []).filter((row) => !selection.excluded.has(row.key));

  const blockers: ImportBlocker[] = [...plan.blockers];
  for (const stay of included(draft.stays)) {
    if (plan.staysOutsideTrip.has(stay.key))
      blockers.push({ code: 'stayOutsideTrip', key: stay.key });
  }
  for (const fallback of included(draft.fallbacks)) {
    if (!resolveFallbackTarget(fallback.key, plan, selection)) {
      blockers.push({ code: 'fallbackUnresolved', key: fallback.key });
    }
  }
  if (blockers.length > 0) return blockers;

  const payload = buildImportPayload(draft, plan, selection);
  const rowCounts = [
    payload.items,
    payload.fallbacks,
    payload.stays,
    payload.notes,
    payload.constraints,
  ].map((rows) => rows?.length ?? 0);
  if (rowCounts.some((count) => count > MAX_IMPORT_ROWS)) {
    blockers.push({ code: 'tooManyRows', max: MAX_IMPORT_ROWS });
  } else if (payloadBytes(payload) > MAX_PAYLOAD_BYTES) {
    blockers.push({ code: 'tooLarge' });
  } else if (isEmptyImport(plan, payload)) {
    blockers.push({ code: 'nothingToImport' });
  }
  return blockers;
}

function isEmptyImport(plan: ImportPlan, payload: ImportPayload): boolean {
  if (plan.mode === 'new') return false;
  const replacesSomething =
    plan.replaced !== null &&
    plan.replaced.items + plan.replaced.stays + plan.replaced.notes + plan.replaced.constraints > 0;
  return (
    payload.items.length === 0 &&
    payload.fallbacks.length === 0 &&
    (payload.stays ?? []).length === 0 &&
    (payload.notes ?? []).length === 0 &&
    (payload.constraints ?? []).length === 0 &&
    plan.cityChanges.length === 0 &&
    plan.extendedFrom === null &&
    !replacesSomething
  );
}

// ---------------------------------------------------------------------------
// import_trip 的 p_payload（欄位名稱與 supabase/migrations 的 import_trip 一致）
// ---------------------------------------------------------------------------

export type ImportPayload = {
  days: { date: string; city: string | null }[];
  items: {
    ref: string;
    date: string;
    title: string;
    time_slot: TimeSlot;
    category: ItemCategory;
    start_time: string | null;
    end_time: string | null;
    description: string | null;
  }[];
  fallbacks: {
    item_ref: string | null;
    item_id: string | null;
    condition: string | null;
    alternative: string;
  }[];
  // null：檔案沒有這張工作表（覆蓋模式不替換這一類）。
  stays:
    | {
        name: string;
        check_in: string;
        check_out: string;
        address: string | null;
        status: StayStatus;
        confirmation_code: string | null;
        url: string | null;
        note: string | null;
      }[]
    | null;
  notes: { topic: string; content: string | null }[] | null;
  constraints: { kind: TravelerConstraintKind; subject: string | null; content: string }[] | null;
};

// 呼叫前先確認 importBlockers() 是空的；對不到項目的備案不會放進去。
export function buildImportPayload(
  draft: ImportDraft,
  plan: ImportPlan,
  selection: ImportSelection,
): ImportPayload {
  const keep = <T extends { key: string }>(row: T) => !selection.excluded.has(row.key);

  return {
    // 不勾的項目所在的天仍然要送：覆蓋以天為單位，城市也要套用。
    days: draft.days.map((day) => ({ date: day.date, city: day.city })),
    items: draft.items.filter(keep).map((item) => {
      const override = selection.itemOverrides.get(item.key);
      return {
        ref: item.key,
        date: item.date,
        title: item.title,
        time_slot: override?.timeSlot ?? item.timeSlot,
        category: override?.category ?? item.category,
        start_time: item.startTime,
        end_time: item.endTime,
        description: item.description,
      };
    }),
    fallbacks: (draft.fallbacks ?? []).filter(keep).flatMap((fallback) => {
      const target = resolveFallbackTarget(fallback.key, plan, selection);
      if (!target) return [];
      return [
        {
          item_ref: target.source === 'file' ? target.key : null,
          item_id: target.source === 'existing' ? target.id : null,
          condition: fallback.condition,
          alternative: fallback.alternative,
        },
      ];
    }),
    stays:
      draft.stays?.filter(keep).map((stay) => ({
        name: stay.name,
        check_in: stay.checkIn,
        check_out: stay.checkOut,
        address: stay.address,
        status: stay.status,
        confirmation_code: stay.confirmationCode,
        url: stay.url,
        note: stay.note,
      })) ?? null,
    notes: draft.notes?.filter(keep).map(({ topic, content }) => ({ topic, content })) ?? null,
    constraints:
      draft.constraints
        ?.filter(keep)
        .map(({ kind, subject, content }) => ({ kind, subject, content })) ?? null,
  };
}
