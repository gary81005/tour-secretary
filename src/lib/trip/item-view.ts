import type { Tables } from '@/types/database';

// 顯示一個行程項目需要的欄位（項目卡片、「現在／下一站」）。
// 線上查到的 DayItem（多了座標）與離線快照的項目都符合這個型別。
// updated_at：調整方案的 expected_updated_at；replaces_item_id：「改用備案」新增的項目（ADR 0009）。
export type ItemView = Pick<
  Tables<'items'>,
  | 'id'
  | 'title'
  | 'time_slot'
  | 'category'
  | 'start_time'
  | 'end_time'
  | 'description'
  | 'url'
  | 'position'
  | 'done_at'
  | 'skipped_at'
  | 'updated_at'
  | 'replaces_item_id'
> & {
  item_places: Pick<Tables<'item_places'>, 'id' | 'name' | 'position' | 'place_id'>[];
  fallbacks: Pick<Tables<'fallbacks'>, 'id' | 'condition' | 'alternative' | 'position'>[];
};
