import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  importNewTripSchema,
  importPayloadSchema,
  type ValidImportPayload,
} from '@/lib/import/payload-schema';
import { parseWorkbook } from '@/lib/import/parse-workbook';
import { planImport } from '@/lib/import/plan';
import { readWorkbook } from '@/lib/import/read-workbook';
import { buildImportPayload, initialSelection, type ImportPayload } from '@/lib/import/selection';

const UUID = '8f14e45f-ceea-4e6a-9c7a-1b2c3d4e5f60';

const item = (
  ref: string,
  date: string,
  overrides: Partial<ImportPayload['items'][number]> = {},
) => ({
  ref,
  date,
  title: '淺草寺',
  time_slot: 'morning' as const,
  category: 'sightseeing' as const,
  start_time: null,
  end_time: null,
  description: null,
  ...overrides,
});

const valid: ImportPayload = {
  days: [
    { date: '2027-03-05', city: '東京' },
    { date: '2027-03-06', city: null },
  ],
  items: [item('行程!B3', '2027-03-05'), item('行程!D3', '2027-03-06', { title: '晴空塔' })],
  fallbacks: [
    { item_ref: '行程!D3', item_id: null, condition: '下雨', alternative: '上野博物館' },
    { item_ref: null, item_id: UUID, condition: null, alternative: '改逛溫泉街' },
  ],
  stays: [
    {
      name: '東京飯店',
      check_in: '2027-03-05',
      check_out: '2027-03-06',
      address: null,
      status: 'booked',
      confirmation_code: null,
      url: 'https://example.com',
      note: null,
    },
  ],
  notes: [{ topic: '行李', content: null }],
  constraints: null,
};

const parse = (overrides: Partial<ImportPayload>) =>
  importPayloadSchema.safeParse({ ...valid, ...overrides });

describe('importPayloadSchema', () => {
  it('合法資料通過，型別與 ImportPayload 一致', () => {
    expect(importPayloadSchema.safeParse(valid).success).toBe(true);
    expectTypeOf<ValidImportPayload>().toEqualTypeOf<ImportPayload>();
  });

  it('範例檔案解析後組出的資料可以通過', async () => {
    const file = readFileSync(new URL('../../docs/samples/東北秘境探險.xlsx', import.meta.url));
    const draft = parseWorkbook(await readWorkbook(new Uint8Array(file).buffer));
    const plan = planImport(draft, { mode: 'new' });
    const payload = buildImportPayload(draft, plan, initialSelection(plan));
    expect(importPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('日期要遞增、不能重複，且不超過 60 天', () => {
    expect(parse({ days: [...valid.days].reverse() }).success).toBe(false);
    expect(parse({ days: [valid.days[0], valid.days[0]], items: [] }).success).toBe(false);
    expect(
      parse({
        days: [
          { date: '2027-03-01', city: null },
          { date: '2027-04-30', city: null },
        ],
        items: [],
        fallbacks: [],
      }).success,
    ).toBe(false);
  });

  it('項目的日期要在 days 裡，ref 不能重複', () => {
    expect(parse({ items: [item('行程!B3', '2027-03-07')], fallbacks: [] }).success).toBe(false);
    expect(
      parse({ items: [item('行程!B3', '2027-03-05'), item('行程!B3', '2027-03-06')] }).success,
    ).toBe(false);
  });

  it('結束時間要有開始時間，且晚於開始時間', () => {
    const withTimes = (start_time: string | null, end_time: string | null) =>
      parse({ items: [item('行程!B3', '2027-03-05', { start_time, end_time })], fallbacks: [] })
        .success;
    expect(withTimes('09:00', '10:30')).toBe(true);
    expect(withTimes(null, '10:30')).toBe(false);
    expect(withTimes('10:30', '10:30')).toBe(false);
  });

  it('備案只能掛到這次的項目或既有項目其中一個，ref 要存在', () => {
    const fallback = (item_ref: string | null, item_id: string | null) =>
      parse({ fallbacks: [{ item_ref, item_id, condition: null, alternative: '改逛溫泉街' }] })
        .success;
    expect(fallback('行程!B3', null)).toBe(true);
    expect(fallback(null, UUID)).toBe(true);
    expect(fallback(null, null)).toBe(false);
    expect(fallback('行程!B3', UUID)).toBe(false);
    expect(fallback('行程!Z9', null)).toBe(false);
    expect(fallback(null, 'not-a-uuid')).toBe(false);
  });

  it('欄位長度、選項與住宿日期', () => {
    expect(
      parse({ items: [item('行程!B3', '2027-03-05', { title: 'a'.repeat(201) })], fallbacks: [] })
        .success,
    ).toBe(false);
    expect(
      parse({ days: [{ date: '2027-03-05', city: 'a'.repeat(51) }], items: [], fallbacks: [] })
        .success,
    ).toBe(false);
    expect(parse({ notes: [{ topic: ' ', content: null }] }).success).toBe(false);
    expect(
      parse({ constraints: [{ kind: 'unknown' as never, subject: null, content: '不吃牛肉' }] })
        .success,
    ).toBe(false);
    expect(parse({ stays: [{ ...valid.stays![0], check_out: '2027-03-05' }] }).success).toBe(false);
    expect(parse({ stays: [{ ...valid.stays![0], url: 'javascript:alert(1)' }] }).success).toBe(
      false,
    );
  });

  it('工作表不存在是 null，存在但全部不匯入是空陣列', () => {
    const result = parse({ stays: [], notes: null });
    expect(result.success && result.data.stays).toEqual([]);
    expect(result.success && result.data.notes).toBeNull();
  });
});

describe('importNewTripSchema', () => {
  it('名稱必填並 trim，時區要合法', () => {
    expect(importNewTripSchema.parse({ name: ' 東北 ', timezone: 'Asia/Tokyo' }).name).toBe('東北');
    expect(importNewTripSchema.safeParse({ name: ' ', timezone: 'Asia/Tokyo' }).success).toBe(
      false,
    );
    expect(importNewTripSchema.safeParse({ name: '東北', timezone: 'Mars/Base' }).success).toBe(
      false,
    );
  });
});
