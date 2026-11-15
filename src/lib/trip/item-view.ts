import type { Tables } from '@/types/database';

// 顯示一個行程項目需要的欄位（項目卡片、「現在／下一站」）。
// 線上查到的 DayItem（多了座標）與離線快照的項目都符合這個型別。
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
> & {
  item_places: Pick<Tables<'item_places'>, 'id' | 'name' | 'position' | 'place_id'>[];
  fallbacks: Pick<Tables<'fallbacks'>, 'id' | 'condition' | 'alternative' | 'position'>[];
};
