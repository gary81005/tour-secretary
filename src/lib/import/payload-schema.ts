import { z } from 'zod';
import { ITEM_CATEGORIES, STAY_STATUSES, TRAVELER_CONSTRAINT_KINDS } from '@/lib/trip/enums';
import {
  isoDate,
  optionalText,
  optionalTime,
  optionalUrl,
  requiredText,
  timezone,
} from '@/lib/trip/schemas';
import { TIME_SLOTS } from '@/lib/trip/time-slot';
import { countDays, MAX_TRIP_DAYS } from '@/lib/trip/trip-dates';
import { MAX_IMPORT_ROWS } from './selection';

// Server Action 收到的匯入資料（selection.ts 的 buildImportPayload 產生）再驗一次（ADR 0008 Q11）。
// 瀏覽器端的預覽已經擋過，這裡失敗表示資料被竄改或程式有錯，所以不回傳逐欄錯誤。
// 長度上限與資料表的 check constraint、src/lib/trip/schemas.ts 一致。

const daySchema = z.object({ date: isoDate, city: optionalText(50) });

const itemSchema = z
  .object({
    ref: z.string().min(1).max(50),
    date: isoDate,
    title: requiredText(200),
    time_slot: z.enum(TIME_SLOTS),
    category: z.enum(ITEM_CATEGORIES),
    start_time: optionalTime,
    end_time: optionalTime,
    description: optionalText(5000),
  })
  .refine((v) => !v.end_time || (v.start_time !== null && v.end_time > v.start_time));

// 掛到這次匯入的項目（item_ref）或既有項目（item_id），只能二選一。
const fallbackSchema = z
  .object({
    item_ref: z.string().min(1).max(50).nullable(),
    item_id: z.uuid().nullable(),
    condition: optionalText(500),
    alternative: requiredText(1000),
  })
  .refine((v) => (v.item_ref === null) !== (v.item_id === null));

const staySchema = z
  .object({
    name: requiredText(200),
    check_in: isoDate,
    check_out: isoDate,
    address: optionalText(500),
    status: z.enum(STAY_STATUSES),
    confirmation_code: optionalText(100),
    url: optionalUrl,
    note: optionalText(5000),
  })
  .refine((v) => v.check_out > v.check_in);

const noteSchema = z.object({ topic: requiredText(100), content: optionalText(5000) });

const constraintSchema = z.object({
  kind: z.enum(TRAVELER_CONSTRAINT_KINDS),
  subject: optionalText(50),
  content: requiredText(1000),
});

const rows = <T extends z.ZodType>(schema: T) => z.array(schema).max(MAX_IMPORT_ROWS);

export const importPayloadSchema = z
  .object({
    days: z.array(daySchema).max(MAX_TRIP_DAYS),
    items: rows(itemSchema),
    fallbacks: rows(fallbackSchema),
    // null：檔案沒有這張工作表。
    stays: rows(staySchema).nullable(),
    notes: rows(noteSchema).nullable(),
    constraints: rows(constraintSchema).nullable(),
  })
  .superRefine((payload, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });

    const dates = payload.days.map((day) => day.date);
    if (dates.some((date, i) => i > 0 && date <= dates[i - 1])) invalid('daysNotAscending');
    if (dates.length > 0 && countDays(dates[0], dates.at(-1)!) > MAX_TRIP_DAYS) {
      invalid('tooManyDays');
    }

    const dateSet = new Set(dates);
    if (payload.items.some((item) => !dateSet.has(item.date))) invalid('itemOutsideDays');

    const refs = new Set(payload.items.map((item) => item.ref));
    if (refs.size !== payload.items.length) invalid('duplicateRef');
    if (payload.fallbacks.some((f) => f.item_ref !== null && !refs.has(f.item_ref))) {
      invalid('unknownRef');
    }
  });

export type ValidImportPayload = z.output<typeof importPayloadSchema>;

// 匯入成新行程時，預覽中設定的名稱與預設時區。
export const importNewTripSchema = z.object({ name: requiredText(100), timezone });

export type ImportNewTripValues = z.input<typeof importNewTripSchema>;
