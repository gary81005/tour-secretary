import { describe, expect, it } from 'vitest';
import {
  describePlan,
  isAdjustmentUndoable,
  lateMinutesByWalk,
  planDelay,
  planFallback,
  planSkip,
  suggestedDelayMinutes,
  timeAlert,
  type AdjustableItem,
} from '@/lib/trip/adjustments';
import { minutesToTime, timeToMinutes } from '@/lib/trip/time-slot';

const item = (
  id: string,
  overrides: Partial<AdjustableItem> & Pick<AdjustableItem, 'time_slot'>,
): AdjustableItem => ({
  id,
  title: `項目 ${id}`,
  category: 'sightseeing',
  start_time: null,
  end_time: null,
  position: 0,
  done_at: null,
  skipped_at: null,
  updated_at: `2027-03-05T00:00:0${id.charCodeAt(0) % 10}Z`,
  ...overrides,
});

describe('時間計算', () => {
  it('timeToMinutes / minutesToTime', () => {
    expect(timeToMinutes('09:30:00')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(23 * 60 + 59)).toBe('23:59');
    expect(minutesToTime(24 * 60)).toBeNull();
    expect(minutesToTime(-1)).toBeNull();
  });
});

describe('planDelay', () => {
  const day = [
    item('a', {
      time_slot: 'morning',
      start_time: '09:00:00',
      end_time: '10:00:00',
      done_at: '2027-03-05T01:00:00Z',
    }),
    item('b', { time_slot: 'morning', start_time: '10:40:00', end_time: '11:20:00' }),
    item('c', { time_slot: 'noon', position: 0 }),
    item('d', { time_slot: 'afternoon', start_time: '14:00:00' }),
    item('e', { time_slot: 'all_day', start_time: '10:50:00' }),
    item('f', {
      time_slot: 'afternoon',
      start_time: '15:00:00',
      skipped_at: '2027-03-05T02:00:00Z',
    }),
  ];

  it('從選的項目開始，之後有精確時間、還沒處理的項目延後；時段跟著新的開始時間', () => {
    const result = planDelay(day, 'b', 30);
    expect(result).toEqual({
      ok: true,
      plan: {
        ops: [
          {
            op: 'set_time',
            item_id: 'b',
            expected_updated_at: day[1].updated_at,
            start_time: '11:10',
            end_time: '11:50',
            time_slot: 'noon',
          },
          {
            op: 'set_time',
            item_id: 'd',
            expected_updated_at: day[3].updated_at,
            start_time: '14:30',
            end_time: null,
            time_slot: 'afternoon',
          },
        ],
      },
    });
  });

  it('使用者特別選的時段（例如「整天」）不跟著改', () => {
    const result = planDelay(day, 'e', 30);
    expect(result.ok && result.plan.ops[0]).toMatchObject({
      item_id: 'e',
      start_time: '11:20',
      time_slot: 'all_day',
    });
  });

  it('超過午夜時整筆擋下，列出是哪些項目', () => {
    const late = [
      item('a', { time_slot: 'night', start_time: '21:00:00', end_time: '22:00:00' }),
      item('b', { time_slot: 'night', start_time: '23:00:00', end_time: '23:50:00' }),
    ];
    expect(planDelay(late, 'a', 30)).toEqual({
      ok: false,
      reason: 'pastMidnight',
      items: [{ id: 'b', title: '項目 b' }],
    });
  });

  it('沒有可以延後的項目', () => {
    expect(planDelay(day, 'c', 30)).toMatchObject({ ok: true });
    expect(planDelay([item('c', { time_slot: 'noon' })], 'c', 30)).toEqual({
      ok: false,
      reason: 'nothingToDelay',
    });
    expect(planDelay(day, 'missing', 30)).toEqual({ ok: false, reason: 'nothingToDelay' });
  });

  it('suggestedDelayMinutes：以 15 分鐘為單位進位', () => {
    expect(suggestedDelayMinutes(12)).toBe(15);
    expect(suggestedDelayMinutes(15)).toBe(15);
    expect(suggestedDelayMinutes(16)).toBe(30);
  });
});

describe('planSkip / planFallback', () => {
  const original = item('a', {
    time_slot: 'morning',
    category: 'sightseeing',
    start_time: '09:00:00',
    end_time: '10:00:00',
  });

  it('跳過：一個 skip 操作', () => {
    expect(planSkip(original)).toEqual({
      ops: [{ op: 'skip', item_id: 'a', expected_updated_at: original.updated_at }],
    });
  });

  it('改用備案：跳過原項目，同一個位置新增項目，沿用時段、時間、類別', () => {
    expect(planFallback(original, 'day-1', '  改逛上野  ').ops).toEqual([
      { op: 'skip', item_id: 'a', expected_updated_at: original.updated_at },
      {
        op: 'add_item',
        day_id: 'day-1',
        title: '改逛上野',
        time_slot: 'morning',
        category: 'sightseeing',
        start_time: '09:00',
        end_time: '10:00',
        replaces_item_id: 'a',
      },
    ]);
  });

  it('改用備案：標題最多 200 字', () => {
    const plan = planFallback(original, 'day-1', '長'.repeat(300));
    expect(plan.ops[1]).toMatchObject({ title: '長'.repeat(200) });
  });
});

describe('describePlan', () => {
  it('列出改時間、跳過、新增', () => {
    const items = [
      item('a', {
        time_slot: 'morning',
        start_time: '09:00:00',
        end_time: '10:00:00',
        title: '淺草寺',
      }),
      item('b', { time_slot: 'noon', title: '午餐' }),
    ];
    const changes = describePlan(
      {
        ops: [
          {
            op: 'set_time',
            item_id: 'a',
            expected_updated_at: 'x',
            start_time: '09:30',
            end_time: '10:30',
            time_slot: 'morning',
          },
          { op: 'skip', item_id: 'b', expected_updated_at: 'x' },
          {
            op: 'add_item',
            day_id: 'd',
            title: '便利商店',
            time_slot: 'noon',
            category: 'meal',
            start_time: null,
            end_time: null,
            replaces_item_id: 'b',
          },
          { op: 'skip', item_id: 'gone', expected_updated_at: 'x' },
        ],
      },
      items,
    );
    expect(changes).toEqual([
      {
        kind: 'time',
        itemId: 'a',
        title: '淺草寺',
        from: { start: '09:00', end: '10:00' },
        to: { start: '09:30', end: '10:30' },
      },
      { kind: 'skip', itemId: 'b', title: '午餐' },
      { kind: 'add', title: '便利商店', start: null, end: null },
    ]);
  });
});

describe('timeAlert', () => {
  const current = { done_at: null, skipped_at: null };
  const next = { id: 'n', start_time: '10:00:00' };

  it('到了建議出發時間：該出發了；過了開始時間：已經晚了', () => {
    expect(timeAlert({ current, next, now: '09:39', departure: '09:40' })).toBeNull();
    expect(timeAlert({ current, next, now: '09:40', departure: '09:40' })).toEqual({
      kind: 'leaveNow',
      itemId: 'n',
    });
    expect(timeAlert({ current, next, now: '10:00', departure: '09:40' })).toEqual({
      kind: 'late',
      itemId: 'n',
    });
  });

  it('沒有建議出發時間時，開始前 15 分鐘算該出發了', () => {
    expect(timeAlert({ current, next, now: '09:44', departure: null })).toBeNull();
    expect(timeAlert({ current, next, now: '09:45', departure: null })?.kind).toBe('leaveNow');
  });

  it('下一站沒有精確時間、沒有「現在」的項目時不提醒', () => {
    expect(
      timeAlert({ current, next: { id: 'n', start_time: null }, now: '23:00', departure: null }),
    ).toBeNull();
    expect(timeAlert({ current: null, next, now: '23:00', departure: null })).toBeNull();
  });
});

describe('lateMinutesByWalk', () => {
  it('預估晚 15 分鐘以上才算會遲到', () => {
    expect(lateMinutesByWalk('09:50', 14 * 60, '10:00')).toBeNull();
    expect(lateMinutesByWalk('09:50', 25 * 60, '10:00')).toBe(15);
    expect(lateMinutesByWalk('09:50', 25 * 60 + 1, '10:00')).toBe(16);
  });
});

describe('isAdjustmentUndoable', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  it('allows the latest adjustment within 7 days', () => {
    expect(
      isAdjustmentUndoable({ created_at: '2026-11-11T12:00:00+00:00', undone_at: null }, now),
    ).toBe(true);
  });

  it('rejects adjustments older than 7 days or already undone', () => {
    expect(
      isAdjustmentUndoable({ created_at: '2026-11-11T11:59:59+00:00', undone_at: null }, now),
    ).toBe(false);
    expect(
      isAdjustmentUndoable(
        { created_at: '2026-11-18T10:00:00+00:00', undone_at: '2026-11-18T11:00:00+00:00' },
        now,
      ),
    ).toBe(false);
  });
});
