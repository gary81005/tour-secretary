import dayjs from '@/lib/dayjs';
import type { ItemView } from '@/lib/trip/item-view';
import { localDate, resolveTimezone } from '@/lib/trip/timezones';
import { getTripPhase, type DayInZone } from '@/lib/trip/trip-phase';
import type { Tables } from '@/types/database';

// 離線快照（ADR 0010 Q11）：線上打開進行中或 7 天內出發的行程時，存進這支手機的 IndexedDB，
// 沒有網路時由離線行程頁讀取。只存使用者自己填的資料：Google 的資料（營業時間、地址、移動時間）
// 與地點座標都不存（ADR 0006），地點只留名稱與地點 ID，用來產生「在 Google 地圖開啟」的連結。

// 格式改變時加一；讀到其他版本的快照直接丟掉，下次線上打開行程時會重新存。
// 2：項目加上 skipped_at、updated_at、replaces_item_id（M6）。
export const OFFLINE_SNAPSHOT_VERSION = 2;

export type OfflineDay = Pick<Tables<'days'>, 'id' | 'date' | 'city' | 'timezone'> & {
  items: ItemView[];
};

export type OfflineStay = Pick<
  Tables<'stays'>,
  | 'id'
  | 'name'
  | 'check_in'
  | 'check_out'
  | 'address'
  | 'status'
  | 'confirmation_code'
  | 'url'
  | 'note'
  | 'place_id'
>;

export type OfflineSnapshot = {
  version: typeof OFFLINE_SNAPSHOT_VERSION;
  tripId: string;
  // 伺服器讀取資料的時間（ISO），離線頁顯示「資料更新於 …」
  fetchedAt: string;
  trip: Pick<Tables<'trips'>, 'id' | 'name' | 'start_date' | 'end_date' | 'default_timezone'>;
  // 依日期排序，每一天的項目依 position 排序（時段分組交給 groupItemsBySlot）
  days: OfflineDay[];
  stays: OfflineStay[];
  notes: Pick<Tables<'trip_notes'>, 'id' | 'topic' | 'content' | 'position'>[];
  constraints: Pick<Tables<'traveler_constraints'>, 'id' | 'kind' | 'subject' | 'content'>[];
};

export type OfflineSnapshotSource = {
  trip: OfflineSnapshot['trip'];
  days: Omit<OfflineDay, 'items'>[];
  items: (ItemView & { day_id: string })[];
  stays: OfflineStay[];
  notes: OfflineSnapshot['notes'];
  constraints: OfflineSnapshot['constraints'];
};

// 組成快照。每個欄位都明確挑出來，查詢多帶的欄位（例如座標）不會被存進手機。
export function buildOfflineSnapshot(
  source: OfflineSnapshotSource,
  fetchedAt: Date,
): OfflineSnapshot {
  const { trip } = source;
  const days = source.days.toSorted((a, b) => a.date.localeCompare(b.date));

  return {
    version: OFFLINE_SNAPSHOT_VERSION,
    tripId: trip.id,
    fetchedAt: fetchedAt.toISOString(),
    trip: {
      id: trip.id,
      name: trip.name,
      start_date: trip.start_date,
      end_date: trip.end_date,
      default_timezone: trip.default_timezone,
    },
    days: days.map((day) => ({
      id: day.id,
      date: day.date,
      city: day.city,
      timezone: day.timezone,
      items: source.items
        .filter((item) => item.day_id === day.id)
        .toSorted((a, b) => a.position - b.position)
        .map(pickItem),
    })),
    stays: source.stays.map((stay) => ({
      id: stay.id,
      name: stay.name,
      check_in: stay.check_in,
      check_out: stay.check_out,
      address: stay.address,
      status: stay.status,
      confirmation_code: stay.confirmation_code,
      url: stay.url,
      note: stay.note,
      place_id: stay.place_id,
    })),
    notes: source.notes.map((note) => ({
      id: note.id,
      topic: note.topic,
      content: note.content,
      position: note.position,
    })),
    constraints: source.constraints.map((constraint) => ({
      id: constraint.id,
      kind: constraint.kind,
      subject: constraint.subject,
      content: constraint.content,
    })),
  };
}

function pickItem(item: ItemView): ItemView {
  return {
    id: item.id,
    title: item.title,
    time_slot: item.time_slot,
    category: item.category,
    start_time: item.start_time,
    end_time: item.end_time,
    description: item.description,
    url: item.url,
    position: item.position,
    done_at: item.done_at,
    skipped_at: item.skipped_at,
    updated_at: item.updated_at,
    replaces_item_id: item.replaces_item_id,
    item_places: item.item_places
      .toSorted((a, b) => a.position - b.position)
      .map((place) => ({
        id: place.id,
        name: place.name,
        position: place.position,
        place_id: place.place_id,
      })),
    fallbacks: item.fallbacks
      .toSorted((a, b) => a.position - b.position)
      .map((fallback) => ({
        id: fallback.id,
        condition: fallback.condition,
        alternative: fallback.alternative,
        position: fallback.position,
      })),
  };
}

// 離線快照的範圍（ADR 0010 Q5）：進行中，或 7 天內出發的行程。
export const OFFLINE_SNAPSHOT_DAYS = 7;

export function keepsOfflineSnapshot(days: readonly DayInZone[], now: Date): boolean {
  const phase = getTripPhase(days, now);
  if (phase === 'ongoing') return true;
  if (phase === 'past') return false;
  const first = days[0];
  if (!first) return false;
  const today = localDate(first.timezone, now);
  return first.date <= dayjs.utc(today).add(OFFLINE_SNAPSHOT_DAYS, 'day').format('YYYY-MM-DD');
}

// 快照還能用嗎：格式是目前版本，而且行程仍是進行中或 7 天內出發（行程結束隔天就過期）。
// 從 IndexedDB 讀出來的資料不一定是目前的格式，所以參數是 unknown。
export function isSnapshotCurrent(snapshot: unknown, now: Date): snapshot is OfflineSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null) return false;
  const candidate = snapshot as Partial<OfflineSnapshot>;
  if (candidate.version !== OFFLINE_SNAPSHOT_VERSION || !candidate.trip || !candidate.days) {
    return false;
  }
  const defaultTimezone = candidate.trip.default_timezone;
  return keepsOfflineSnapshot(
    candidate.days.map((day) => ({
      date: day.date,
      timezone: resolveTimezone(day, defaultTimezone),
    })),
    now,
  );
}
