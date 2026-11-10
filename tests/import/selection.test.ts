import { describe, expect, it } from 'vitest';
import { planImport, type FallbackTarget } from '@/lib/import/plan';
import {
  buildImportPayload,
  importBlockers,
  initialSelection,
  MAX_IMPORT_ROWS,
  MAX_PAYLOAD_BYTES,
  resolveFallbackTarget,
  setFallbackTarget,
  setIncluded,
  setItemOverride,
  type ImportSelection,
} from '@/lib/import/selection';
import { draft, draftFallback, draftItem, draftStay, existingTrip } from './draft-fixtures';

const fileDraft = draft({
  days: [
    { date: '2027-03-05', city: '東京' },
    { date: '2027-03-06', city: null },
  ],
  items: [
    draftItem('行程!B3', '2027-03-05', '淺草寺'),
    { ...draftItem('行程!B4', '2027-03-05', '晚餐'), startTime: '18:00', timeSlot: 'evening' },
    draftItem('行程!D3', '2027-03-06', '晴空塔'),
  ],
  fallbacks: [draftFallback('備案!2', '2027-03-06', '晴空塔')],
  stays: [draftStay('住宿!2', '東京飯店', '2027-03-05', '2027-03-06')],
  notes: [{ key: '提醒事項!2', topic: '行李', content: '精簡' }],
  constraints: null,
});

describe('initialSelection', () => {
  it('重複的資料預設不匯入', () => {
    const plan = planImport(fileDraft, { mode: 'append', trip: existingTrip() });
    // 既有行程已有 3/5 淺草寺、3/6 晴空塔與「行李」
    expect([...initialSelection(plan).excluded].sort()).toEqual([
      '提醒事項!2',
      '行程!B3',
      '行程!D3',
    ]);
  });
});

describe('buildImportPayload', () => {
  it('組出 import_trip 的資料，套用勾選與修改', () => {
    const plan = planImport(fileDraft, { mode: 'new' });
    const selection: ImportSelection = {
      ...initialSelection(plan),
      excluded: new Set(['行程!B3', '提醒事項!2']),
      itemOverrides: new Map([['行程!B4', { category: 'meal' }]]),
    };
    expect(buildImportPayload(fileDraft, plan, selection)).toEqual({
      days: [
        { date: '2027-03-05', city: '東京' },
        { date: '2027-03-06', city: null },
      ],
      items: [
        {
          ref: '行程!B4',
          date: '2027-03-05',
          title: '晚餐',
          time_slot: 'evening',
          category: 'meal',
          start_time: '18:00',
          end_time: null,
          description: null,
        },
        expect.objectContaining({ ref: '行程!D3', category: 'sightseeing' }),
      ],
      fallbacks: [
        { item_ref: '行程!D3', item_id: null, condition: null, alternative: '改逛溫泉街' },
      ],
      stays: [
        {
          name: '東京飯店',
          check_in: '2027-03-05',
          check_out: '2027-03-06',
          address: null,
          status: 'candidate',
          confirmation_code: null,
          url: null,
          note: null,
        },
      ],
      // 有工作表但全部不勾：空陣列（覆蓋模式會清空這一類）
      notes: [],
      // 沒有工作表：null
      constraints: null,
    });
  });

  it('備案掛到既有項目時送 item_id', () => {
    const fallbackOnly = draft({
      scheduleSheet: null,
      fallbacks: [draftFallback('備案!2', '2027-03-05', '淺草寺')],
    });
    const plan = planImport(fallbackOnly, { mode: 'append', trip: existingTrip() });
    expect(buildImportPayload(fallbackOnly, plan, initialSelection(plan)).fallbacks).toEqual([
      { item_ref: null, item_id: 'i1', condition: null, alternative: '改逛溫泉街' },
    ]);
  });
});

describe('resolveFallbackTarget / importBlockers', () => {
  const plan = planImport(fileDraft, { mode: 'new' });
  const other: FallbackTarget = {
    source: 'file',
    key: '行程!B4',
    date: '2027-03-05',
    title: '晚餐',
  };

  it('使用者改選的項目優先', () => {
    const selection = { ...initialSelection(plan), fallbackTargets: new Map([['備案!2', other]]) };
    expect(resolveFallbackTarget('備案!2', plan, selection)).toBe(other);
  });

  it('掛到不匯入的項目時要重新選擇', () => {
    const selection = { ...initialSelection(plan), excluded: new Set(['行程!D3']) };
    expect(resolveFallbackTarget('備案!2', plan, selection)).toBeNull();
    expect(importBlockers(fileDraft, plan, selection)).toEqual([
      { code: 'fallbackUnresolved', key: '備案!2' },
    ]);
    // 備案本身也不匯入就沒問題
    const skipBoth = { ...selection, excluded: new Set(['行程!D3', '備案!2']) };
    expect(importBlockers(fileDraft, plan, skipBoth)).toEqual([]);
  });

  it('勾選的住宿超出範圍時擋下，不勾就不擋', () => {
    const outside = draft({
      ...fileDraft,
      stays: [draftStay('住宿!2', 'A', '2027-03-06', '2027-03-08')],
    });
    const outsidePlan = planImport(outside, { mode: 'new' });
    expect(importBlockers(outside, outsidePlan, initialSelection(outsidePlan))).toEqual([
      { code: 'stayOutsideTrip', key: '住宿!2' },
    ]);
    const skipped = { ...initialSelection(outsidePlan), excluded: new Set(['住宿!2']) };
    expect(importBlockers(outside, outsidePlan, skipped)).toEqual([]);
  });

  it('附加時全部都不匯入就沒有東西可匯入', () => {
    const same = draft({
      days: [{ date: '2027-03-05', city: '東京' }],
      items: [draftItem('行程!B3', '2027-03-05', '淺草寺')],
    });
    const appendPlan = planImport(same, { mode: 'append', trip: existingTrip() });
    expect(importBlockers(same, appendPlan, initialSelection(appendPlan))).toEqual([
      { code: 'nothingToImport' },
    ]);
  });

  it('任何一類超過筆數上限時擋下', () => {
    const many = draft({
      days: [{ date: '2027-03-05', city: null }],
      items: Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) =>
        draftItem(`行程!B${i + 3}`, '2027-03-05', `項目 ${i}`),
      ),
    });
    const manyPlan = planImport(many, { mode: 'new' });
    expect(importBlockers(many, manyPlan, initialSelection(manyPlan))).toEqual([
      { code: 'tooManyRows', max: MAX_IMPORT_ROWS },
    ]);
    // 取消勾選一筆就可以匯入
    const fewer = setIncluded(initialSelection(manyPlan), '行程!B3', false);
    expect(importBlockers(many, manyPlan, fewer)).toEqual([]);
  });

  it('資料超過 Server Action 的上限時擋下', () => {
    const description = '說'.repeat(4000);
    const large = draft({
      days: [{ date: '2027-03-05', city: null }],
      items: Array.from({ length: 80 }, (_, i) => ({
        ...draftItem(`行程!B${i + 3}`, '2027-03-05', `項目 ${i}`),
        description,
      })),
    });
    const largePlan = planImport(large, { mode: 'new' });
    expect(MAX_PAYLOAD_BYTES).toBeLessThan(80 * 4000 * 3);
    expect(importBlockers(large, largePlan, initialSelection(largePlan))).toEqual([
      { code: 'tooLarge' },
    ]);
  });

  it('覆蓋時即使沒有新資料，會清掉既有資料就可以匯入', () => {
    const empty = draft({ days: [{ date: '2027-03-05', city: null }] });
    const overwritePlan = planImport(empty, { mode: 'overwrite', trip: existingTrip() });
    expect(importBlockers(empty, overwritePlan, initialSelection(overwritePlan))).toEqual([]);
  });
});

describe('預覽中的修改', () => {
  const plan = planImport(fileDraft, { mode: 'new' });
  const initial = initialSelection(plan);

  it('勾選與取消勾選，不改動原本的 selection', () => {
    const skipped = setIncluded(initial, '行程!B3', false);
    expect(skipped.excluded.has('行程!B3')).toBe(true);
    expect(initial.excluded.has('行程!B3')).toBe(false);
    expect(setIncluded(skipped, '行程!B3', true).excluded.has('行程!B3')).toBe(false);
  });

  it('時段與類別分開修改，會合併', () => {
    const next = setItemOverride(
      setItemOverride(initial, '行程!B3', { timeSlot: 'noon' }),
      '行程!B3',
      { category: 'meal' },
    );
    expect(next.itemOverrides.get('行程!B3')).toEqual({ timeSlot: 'noon', category: 'meal' });
    expect(initial.itemOverrides.size).toBe(0);
  });

  it('清掉備案的選擇後視為對不到', () => {
    const cleared = setFallbackTarget(initial, '備案!2', null);
    expect(resolveFallbackTarget('備案!2', plan, cleared)).toBeNull();
    expect(initial.fallbackTargets.size).toBe(0);
  });
});
