import { describe, expect, it } from 'vitest';
import {
  canMarkDone,
  dayProgress,
  nowStay,
  suggestedDeparture,
  withDone,
} from '@/lib/trip/progress';

describe('canMarkDone', () => {
  it('今天與之前的天可以打勾，未來的天不行', () => {
    expect(canMarkDone('2027-03-05', '2027-03-06')).toBe(true);
    expect(canMarkDone('2027-03-06', '2027-03-06')).toBe(true);
    expect(canMarkDone('2027-03-07', '2027-03-06')).toBe(false);
  });
});

const item = (
  id: string,
  time_slot: 'morning' | 'afternoon',
  position: number,
  done = false,
  start_time: string | null = null,
) => ({
  id,
  time_slot,
  start_time,
  position,
  done_at: done ? '2027-03-06T01:00:00Z' : null,
  skipped_at: null as string | null,
});

describe('dayProgress', () => {
  it('依當天順序，第一個未完成的是現在、第二個是下一站', () => {
    const progress = dayProgress([
      item('c', 'afternoon', 0),
      item('b', 'morning', 1),
      item('a', 'morning', 0, true),
    ]);
    expect(progress.current?.id).toBe('b');
    expect(progress.next?.id).toBe('c');
    expect(progress.allDone).toBe(false);
  });

  it('有精確時間的排在同時段前面', () => {
    const progress = dayProgress([
      item('a', 'morning', 0),
      item('b', 'morning', 1, false, '09:00:00'),
    ]);
    expect(progress.current?.id).toBe('b');
  });

  it('只剩一個未完成時沒有下一站', () => {
    const progress = dayProgress([item('a', 'morning', 0, true), item('b', 'morning', 1)]);
    expect(progress).toMatchObject({ current: { id: 'b' }, next: null, allDone: false });
  });

  it('跳過的項目當成已處理；全部完成或跳過時算全部完成', () => {
    const skipped = { ...item('a', 'morning', 0), skipped_at: '2027-03-06T01:00:00Z' };
    expect(dayProgress([skipped, item('b', 'morning', 1)])).toMatchObject({
      current: { id: 'b' },
      next: null,
    });
    expect(dayProgress([skipped, item('b', 'morning', 1, true)]).allDone).toBe(true);
  });

  it('全部完成；沒有項目時不算全部完成', () => {
    expect(dayProgress([item('a', 'morning', 0, true)]).allDone).toBe(true);
    expect(dayProgress([])).toEqual({ current: null, next: null, allDone: false });
  });
});

describe('withDone', () => {
  it('只改指定的項目', () => {
    const items = [item('a', 'morning', 0), item('b', 'morning', 1, true)];
    expect(withDone(items, 'a', '2027-03-06T02:00:00Z').map((i) => i.done_at)).toEqual([
      '2027-03-06T02:00:00Z',
      '2027-03-06T01:00:00Z',
    ]);
    expect(withDone(items, 'b', null)[1].done_at).toBeNull();
  });

  it('設成完成時一併取消跳過', () => {
    const skipped = { ...item('a', 'morning', 0), skipped_at: '2027-03-06T01:30:00Z' };
    expect(withDone([skipped], 'a', '2027-03-06T02:00:00Z')[0]).toMatchObject({
      done_at: '2027-03-06T02:00:00Z',
      skipped_at: null,
    });
    expect(withDone([skipped], 'a', null)[0].skipped_at).toBe('2027-03-06T01:30:00Z');
  });
});

describe('suggestedDeparture', () => {
  it('開始時間 − 步行時間（無條件進位到分鐘）− 5 分鐘', () => {
    expect(suggestedDeparture('13:00:00', 19 * 60)).toBe('12:36');
    expect(suggestedDeparture('13:00', 18 * 60 + 1)).toBe('12:36');
  });

  it('步行超過 30 分鐘（要搭車）時不建議', () => {
    expect(suggestedDeparture('13:00', 30 * 60)).toBe('12:25');
    expect(suggestedDeparture('13:00', 30 * 60 + 1)).toBeNull();
  });

  it('早於當天 00:00 時不建議', () => {
    expect(suggestedDeparture('00:10', 10 * 60)).toBeNull();
  });
});

describe('nowStay', () => {
  const stay = (
    id: string,
    status: 'candidate' | 'booked' | 'paid',
    address: string | null,
    place_id: string | null,
  ) => ({ id, name: `飯店${id}`, status, address, place_id });

  it('有連結地點時用地點 ID 導航', () => {
    expect(nowStay([stay('a', 'booked', '東京都…', 'P1')])).toEqual({
      id: 'a',
      name: '飯店a',
      destination: { name: '飯店a', placeId: 'P1' },
    });
  });

  it('沒有連結地點時用地址，沒填地址就用名稱', () => {
    expect(nowStay([stay('a', 'booked', '東京都台東区', null)])?.destination).toEqual({
      name: '東京都台東区',
      placeId: null,
    });
    expect(nowStay([stay('a', 'booked', '', null)])?.destination).toEqual({
      name: '飯店a',
      placeId: null,
    });
  });

  it('已預訂的優先，沒有住宿時是 null', () => {
    expect(nowStay([stay('a', 'candidate', null, null), stay('b', 'paid', null, null)])?.id).toBe(
      'b',
    );
    expect(nowStay([])).toBeNull();
  });
});
