import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABELS,
  CONSTRAINT_KIND_LABELS,
  STAY_STATUS_LABELS,
  TIME_SLOT_LABELS,
} from '@/lib/import/vocabulary';
import trips from '../../messages/zh-TW/trips.json';

// 範本用語必須和畫面用語一致，使用者在 app 看到的選項才填得進範本。
describe('範本用語與 zh-TW 畫面用語一致', () => {
  it('時段', () => expect(TIME_SLOT_LABELS).toEqual(trips.timeSlots));
  it('類別', () => expect(CATEGORY_LABELS).toEqual(trips.categories));
  it('訂房狀態', () => expect(STAY_STATUS_LABELS).toEqual(trips.stayStatus));
  it('旅伴限制類型', () => expect(CONSTRAINT_KIND_LABELS).toEqual(trips.constraintKinds));
});
