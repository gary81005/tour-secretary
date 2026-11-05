import { z } from 'zod';
import { ITEM_CATEGORIES, STAY_STATUSES, TRAVELER_CONSTRAINT_KINDS } from './enums';
import { TIME_SLOTS } from './time-slot';
import { isValidTimezone } from './timezones';
import { countDays, MAX_TRIP_DAYS } from './trip-dates';

// 表單驗證規則。長度上限與資料庫的 check constraint 一致。
// 錯誤訊息是翻譯 key（messages/<locale>/validation.json），畫面上再翻成文字。
export type ValidationErrorKey =
  | 'required'
  | 'tooLong'
  | 'tooMany'
  | 'invalidDate'
  | 'invalidTime'
  | 'invalidUrl'
  | 'invalidTimezone'
  | 'invalidOption'
  | 'endBeforeStart'
  | 'tripTooLong'
  | 'endTimeWithoutStart'
  | 'endTimeNotAfterStart'
  | 'checkOutNotAfterCheckIn';

const error = (key: ValidationErrorKey) => ({ error: key });

// 表單送來的空字串視為「沒填」，存成 null。
function optionalField<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value,
    schema.nullable(),
  );
}

const requiredText = (max: number) =>
  z.string(error('required')).trim().min(1, error('required')).max(max, error('tooLong'));

const optionalText = (max: number) => optionalField(z.string().trim().max(max, error('tooLong')));

const date = z.iso.date(error('invalidDate'));

const optionalTime = optionalField(z.iso.time({ precision: -1, ...error('invalidTime') }));

const optionalUrl = optionalField(
  z.url({ protocol: /^https?$/, ...error('invalidUrl') }).max(2000, error('tooLong')),
);

const timezone = z.string(error('required')).refine(isValidTimezone, error('invalidTimezone'));

// ---------------------------------------------------------------------------
// Trip / Day
// ---------------------------------------------------------------------------

const dateRange = z
  .object({ startDate: date, endDate: date })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], ...error('endBeforeStart') })
  .refine((v) => v.endDate < v.startDate || countDays(v.startDate, v.endDate) <= MAX_TRIP_DAYS, {
    path: ['endDate'],
    ...error('tripTooLong'),
  });

export const tripCreateSchema = z.object({ name: requiredText(100), timezone }).and(dateRange);

export const tripUpdateSchema = z.object({
  name: requiredText(100),
  defaultTimezone: timezone,
});

export const tripDateRangeSchema = dateRange;

export const dayUpdateSchema = z.object({
  city: optionalText(50),
  // null 表示沿用行程的預設時區。
  timezone: optionalField(timezone),
});

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

export const itemSchema = z
  .object({
    dayId: z.uuid(),
    title: requiredText(200),
    timeSlot: z.enum(TIME_SLOTS, error('invalidOption')),
    category: z.enum(ITEM_CATEGORIES, error('invalidOption')),
    startTime: optionalTime,
    endTime: optionalTime,
    description: optionalText(5000),
    url: optionalUrl,
    places: z.array(z.object({ name: requiredText(200) })).max(20, error('tooMany')),
    fallbacks: z
      .array(z.object({ condition: optionalText(500), alternative: requiredText(1000) }))
      .max(20, error('tooMany')),
  })
  // 不支援跨午夜（Q19）。
  .refine((v) => !v.endTime || v.startTime, {
    path: ['endTime'],
    ...error('endTimeWithoutStart'),
  })
  .refine((v) => !v.endTime || !v.startTime || v.endTime > v.startTime, {
    path: ['endTime'],
    ...error('endTimeNotAfterStart'),
  });

// ---------------------------------------------------------------------------
// Stay / TripNote / TravelerConstraint
// ---------------------------------------------------------------------------

// 「是否落在行程日期內」要拿行程資料比對，在 Server Action 用 validateStayRange() 檢查。
export const staySchema = z
  .object({
    name: requiredText(200),
    checkIn: date,
    checkOut: date,
    address: optionalText(500),
    status: z.enum(STAY_STATUSES, error('invalidOption')),
    confirmationCode: optionalText(100),
    url: optionalUrl,
    note: optionalText(5000),
  })
  .refine((v) => v.checkOut > v.checkIn, {
    path: ['checkOut'],
    ...error('checkOutNotAfterCheckIn'),
  });

export const tripNoteSchema = z.object({
  topic: requiredText(100),
  content: optionalText(5000),
});

export const travelerConstraintSchema = z.object({
  kind: z.enum(TRAVELER_CONSTRAINT_KINDS, error('invalidOption')),
  subject: optionalText(50),
  content: requiredText(1000),
});

export type TripCreateInput = z.output<typeof tripCreateSchema>;
export type TripUpdateInput = z.output<typeof tripUpdateSchema>;
export type DayUpdateInput = z.output<typeof dayUpdateSchema>;
export type ItemInput = z.output<typeof itemSchema>;
export type StayInput = z.output<typeof staySchema>;
export type TripNoteInput = z.output<typeof tripNoteSchema>;
export type TravelerConstraintInput = z.output<typeof travelerConstraintSchema>;
