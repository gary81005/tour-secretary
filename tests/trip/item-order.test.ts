import { describe, expect, it } from 'vitest';
import { groupItemsBySlot, sortItems, type OrderableItem } from '@/lib/trip/item-order';

const item = (
  id: string,
  time_slot: OrderableItem['time_slot'],
  position: number,
  start_time: string | null = null,
): OrderableItem => ({ id, time_slot, position, start_time });

describe('sortItems', () => {
  it('依時段排序，整天排最前', () => {
    const items = [
      item('night', 'night', 0),
      item('allDay', 'all_day', 0),
      item('am', 'morning', 0),
    ];
    expect(sortItems(items).map((i) => i.id)).toEqual(['allDay', 'am', 'night']);
  });

  it('同時段內有時間的排前面並照時間排，沒時間的照 position', () => {
    const items = [
      item('untimed-2', 'morning', 2),
      item('at-10', 'morning', 9, '10:00:00'),
      item('untimed-1', 'morning', 1),
      item('at-0830', 'morning', 0, '08:30'),
    ];
    expect(sortItems(items).map((i) => i.id)).toEqual([
      'at-0830',
      'at-10',
      'untimed-1',
      'untimed-2',
    ]);
  });

  it('相同時間再依 position，最後依 id，排序結果固定', () => {
    const items = [
      item('b', 'noon', 0, '12:00'),
      item('a', 'noon', 0, '12:00'),
      item('c', 'noon', -1, '12:00'),
    ];
    expect(sortItems(items).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('不修改原陣列', () => {
    const items = [item('b', 'night', 0), item('a', 'morning', 0)];
    sortItems(items);
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('groupItemsBySlot', () => {
  it('只回傳有項目的時段，依時段順序', () => {
    const groups = groupItemsBySlot([
      item('dinner', 'evening', 0, '18:00'),
      item('temple', 'morning', 1),
      item('market', 'morning', 0),
    ]);
    expect(groups.map((g) => [g.slot, g.items.map((i) => i.id)])).toEqual([
      ['morning', ['market', 'temple']],
      ['evening', ['dinner']],
    ]);
  });

  it('沒有項目時回傳空陣列', () => {
    expect(groupItemsBySlot([])).toEqual([]);
  });
});
