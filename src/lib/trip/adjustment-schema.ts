import { z } from 'zod';
import type { AdjustmentPlan } from './adjustments';
import { ITEM_CATEGORIES } from './enums';
import { TIME_SLOTS } from './time-slot';

// 瀏覽器送來的調整方案（applyAdjustment）。apply_trip_adjustment() 會再檢查一次（22023 invalid_plan），
// 這裡先擋掉格式不對的，並確定送進資料庫的只有方案需要的欄位。

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
// 原樣交給資料庫和項目目前的 updated_at 比對，不重新格式化（精確到微秒）。
const timestamp = z.string().min(1).max(64);

const opSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set_time'),
    item_id: z.uuid(),
    expected_updated_at: timestamp,
    start_time: time,
    end_time: time.nullable(),
    time_slot: z.enum(TIME_SLOTS),
  }),
  z.object({
    op: z.literal('skip'),
    item_id: z.uuid(),
    expected_updated_at: timestamp,
  }),
  z.object({
    op: z.literal('add_item'),
    day_id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    time_slot: z.enum(TIME_SLOTS),
    category: z.enum(ITEM_CATEGORIES),
    start_time: time.nullable(),
    end_time: time.nullable(),
    replaces_item_id: z.uuid().nullable(),
  }),
]);

// 一天的項目上限是 100（reorder_items 同樣上限），延後整天也不會超過。
export const adjustmentPlanSchema: z.ZodType<AdjustmentPlan> = z.object({
  ops: z.array(opSchema).min(1).max(100),
});
