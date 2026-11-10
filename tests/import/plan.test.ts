import { describe, expect, it } from 'vitest';
import { planImport } from '@/lib/import/plan';
import { draft, draftFallback, draftItem, draftStay, existingTrip } from './draft-fixtures';

describe('planImport：新建行程', () => {
  it('日期範圍取檔案的第一天到最後一天', () => {
    const plan = planImport(
      draft({
        days: [
          { date: '2027-03-05', city: '東京' },
          { date: '2027-03-08', city: null },
        ],
      }),
      { mode: 'new' },
    );
    expect(plan.range).toEqual({ startDate: '2027-03-05', endDate: '2027-03-08' });
    expect(plan.extendedFrom).toBeNull();
    expect(plan.blockers).toEqual([]);
    expect(plan.replaced).toBeNull();
  });

  it('檔案沒有每日行程時擋下', () => {
    const plan = planImport(draft({ scheduleSheet: null }), { mode: 'new' });
    expect(plan.range).toBeNull();
    expect(plan.blockers).toEqual([{ code: 'noSchedule' }]);
  });

  it('檔案有錯誤時擋下，警告不擋', () => {
    const days = [{ date: '2027-03-05', city: null }];
    const warning = {
      severity: 'warning',
      code: 'rowsIgnored',
      sheet: '行程',
      cell: 'A9',
    } as const;
    const error = { severity: 'error', code: 'required', sheet: '住宿', cell: 'A2' } as const;
    expect(planImport(draft({ days, issues: [warning] }), { mode: 'new' }).blockers).toEqual([]);
    expect(planImport(draft({ days, issues: [error] }), { mode: 'new' }).blockers).toEqual([
      { code: 'fileErrors' },
    ]);
  });

  it('住宿不在檔案日期內', () => {
    const plan = planImport(
      draft({
        days: [
          { date: '2027-03-05', city: null },
          { date: '2027-03-07', city: null },
        ],
        stays: [
          draftStay('住宿!2', 'A', '2027-03-05', '2027-03-07'),
          draftStay('住宿!3', 'B', '2027-03-06', '2027-03-08'),
        ],
      }),
      { mode: 'new' },
    );
    expect([...plan.staysOutsideTrip]).toEqual(['住宿!3']);
  });
});

describe('planImport：附加', () => {
  it('檔案日期超出範圍時延長行程', () => {
    const plan = planImport(draft({ days: [{ date: '2027-03-03', city: null }] }), {
      mode: 'append',
      trip: existingTrip(),
    });
    expect(plan.range).toEqual({ startDate: '2027-03-03', endDate: '2027-03-07' });
    expect(plan.extendedFrom).toEqual({ startDate: '2027-03-05', endDate: '2027-03-07' });
  });

  it('延長後超過 60 天時擋下', () => {
    const plan = planImport(draft({ days: [{ date: '2027-05-10', city: null }] }), {
      mode: 'append',
      trip: existingTrip(),
    });
    expect(plan.blockers).toEqual([{ code: 'tooManyDays', max: 60 }]);
  });

  it('沒有日期的檔案（只有備案）不改範圍', () => {
    const plan = planImport(draft({ scheduleSheet: null }), {
      mode: 'append',
      trip: existingTrip(),
    });
    expect(plan.range).toEqual({ startDate: '2027-03-05', endDate: '2027-03-07' });
    expect(plan.extendedFrom).toBeNull();
    expect(plan.blockers).toEqual([]);
  });

  it('城市只填原本空白的天，其他列為差異', () => {
    const plan = planImport(
      draft({
        days: [
          { date: '2027-03-05', city: '橫濱' },
          { date: '2027-03-06', city: '東京' },
          { date: '2027-03-07', city: '仙台' },
          { date: '2027-03-08', city: '山形' },
        ],
      }),
      { mode: 'append', trip: existingTrip() },
    );
    expect(plan.cityChanges).toEqual([{ date: '2027-03-06', from: null, to: '東京' }]);
    expect(plan.cityConflicts).toEqual([{ date: '2027-03-05', from: '東京', to: '橫濱' }]);
  });

  it('已存在的資料列為重複', () => {
    const plan = planImport(
      draft({
        days: [{ date: '2027-03-05', city: null }],
        items: [
          draftItem('行程!B3', '2027-03-05', '淺草寺；'),
          draftItem('行程!B4', '2027-03-05', '晴空塔'),
        ],
        stays: [
          draftStay('住宿!2', '東京飯店', '2027-03-05', '2027-03-07'),
          draftStay('住宿!3', '東京飯店', '2027-03-05', '2027-03-06'),
        ],
        notes: [
          { key: '提醒事項!2', topic: ' 行李 ', content: null },
          { key: '提醒事項!3', topic: '交通', content: null },
        ],
        constraints: [
          { key: '旅伴限制!2', kind: 'diet', subject: '媽媽', content: '不吃牛肉' },
          { key: '旅伴限制!3', kind: 'other', subject: null, content: '不吃牛肉' },
        ],
      }),
      { mode: 'append', trip: existingTrip() },
    );
    expect([...plan.duplicates].sort()).toEqual(['住宿!2', '提醒事項!2', '旅伴限制!2', '行程!B3']);
  });

  it('備案先比對檔案，再比對既有項目', () => {
    const plan = planImport(
      draft({
        days: [{ date: '2027-03-06', city: null }],
        items: [draftItem('行程!D3', '2027-03-06', '晴空塔')],
        fallbacks: [
          draftFallback('備案!2', '2027-03-06', '晴空塔'),
          draftFallback('備案!3', '2027-03-05', '淺草寺'),
          draftFallback('備案!4', '2027-03-07', '松島'),
        ],
      }),
      { mode: 'append', trip: existingTrip() },
    );
    expect(plan.fallbackTargets.get('備案!2')).toMatchObject({ source: 'file', key: '行程!D3' });
    expect(plan.fallbackTargets.get('備案!3')).toMatchObject({ source: 'existing', id: 'i1' });
    expect(plan.fallbackTargets.get('備案!4')).toBeNull();
  });
});

describe('planImport：覆蓋', () => {
  const overwrite = (overrides: Parameters<typeof draft>[0]) =>
    planImport(draft(overrides), { mode: 'overwrite', trip: existingTrip() });

  it('檔案有寫的城市都蓋過去', () => {
    const plan = overwrite({
      days: [
        { date: '2027-03-05', city: '橫濱' },
        { date: '2027-03-06', city: null },
      ],
    });
    expect(plan.cityChanges).toEqual([{ date: '2027-03-05', from: '東京', to: '橫濱' }]);
    expect(plan.cityConflicts).toEqual([]);
  });

  it('統計會被取代的資料：檔案涵蓋的日期，以及檔案有的工作表', () => {
    const plan = overwrite({ days: [{ date: '2027-03-05', city: null }], stays: [], notes: null });
    expect(plan.replaced).toEqual({
      dates: ['2027-03-05'],
      items: 1,
      stays: 1,
      notes: 0,
      constraints: 0,
    });
    expect(plan.duplicates.size).toBe(0);
  });

  it('備案只比對檔案裡的項目', () => {
    const plan = overwrite({ fallbacks: [draftFallback('備案!2', '2027-03-06', '晴空塔')] });
    expect(plan.fallbackTargets.get('備案!2')).toBeNull();
  });
});
