import { describe, expect, it } from 'vitest';
import {
  dayStayStops,
  durationParts,
  legKey,
  needsDriving,
  planDayLegs,
  planItemLegs,
  type LegStop,
} from '@/lib/maps/legs';

const place = (name: string) => ({ placeId: `id-${name}`, name });
const item = (id: string, ...names: (string | null)[]) => ({
  id,
  places: names.map((name) => (name === null ? null : place(name))),
});
const stay = (stayId: string, name: string): LegStop => ({
  kind: 'stay',
  stayId,
  place: place(name),
});
const route = (legs: ReturnType<typeof planDayLegs>) =>
  legs.map((leg) => `${leg.from.place.name}→${leg.to.place.name}`);

describe('planDayLegs', () => {
  it('前一個項目的最後一個地點到下一個項目的第一個地點', () => {
    const legs = planDayLegs({
      items: [item('a', '淺草寺', '仲見世通'), item('b', '晴空塔')],
      startStay: null,
      endStay: null,
    });
    expect(route(legs)).toEqual(['仲見世通→晴空塔']);
    expect(legs[0].from).toEqual({ kind: 'item', itemId: 'a', place: place('仲見世通') });
  });

  it('沒有連結地點的項目與地點跳過', () => {
    const legs = planDayLegs({
      items: [item('a', '淺草寺', null), item('b'), item('c', null), item('d', null, '晴空塔')],
      startStay: null,
      endStay: null,
    });
    expect(route(legs)).toEqual(['淺草寺→晴空塔']);
  });

  it('一天的頭尾接上前一晚與當晚的住宿', () => {
    const legs = planDayLegs({
      items: [item('a', '淺草寺'), item('b', '晴空塔')],
      startStay: stay('s1', '上野飯店'),
      endStay: stay('s2', '仙台飯店'),
    });
    expect(route(legs)).toEqual(['上野飯店→淺草寺', '淺草寺→晴空塔', '晴空塔→仙台飯店']);
  });

  it('起點與終點是同一個地點時不算', () => {
    const legs = planDayLegs({
      items: [item('a', '上野飯店'), item('b', '上野飯店')],
      startStay: stay('s1', '上野飯店'),
      endStay: stay('s1', '上野飯店'),
    });
    expect(legs).toEqual([]);
  });

  it('沒有連結地點的項目時，直接從前一晚的住宿到當晚的住宿', () => {
    const legs = planDayLegs({
      items: [item('a', null)],
      startStay: stay('s1', '上野飯店'),
      endStay: stay('s2', '仙台飯店'),
    });
    expect(route(legs)).toEqual(['上野飯店→仙台飯店']);
  });
});

describe('dayStayStops', () => {
  const stays = [
    {
      id: 'tokyo',
      check_in: '2027-04-10',
      check_out: '2027-04-12',
      status: 'booked' as const,
      place: place('上野飯店'),
    },
    {
      id: 'sendai-candidate',
      check_in: '2027-04-12',
      check_out: '2027-04-13',
      status: 'candidate' as const,
      place: place('候選飯店'),
    },
    {
      id: 'sendai',
      check_in: '2027-04-12',
      check_out: '2027-04-13',
      status: 'paid' as const,
      place: place('仙台飯店'),
    },
    {
      id: 'unlinked',
      check_in: '2027-04-13',
      check_out: '2027-04-14',
      status: 'booked' as const,
      place: null,
    },
  ];

  it('前一晚與當晚的住宿，已預訂／已付款的優先', () => {
    const { startStay, endStay } = dayStayStops(stays, '2027-04-12');
    expect(startStay).toEqual({ kind: 'stay', stayId: 'tokyo', place: place('上野飯店') });
    expect(endStay).toEqual({ kind: 'stay', stayId: 'sendai', place: place('仙台飯店') });
  });

  it('沒有住宿或住宿沒有連結地點時是 null', () => {
    expect(dayStayStops(stays, '2027-04-10').startStay).toBeNull();
    expect(dayStayStops(stays, '2027-04-13').endStay).toBeNull();
  });

  it('只有候選住宿時也用候選的', () => {
    expect(dayStayStops(stays.slice(0, 2), '2027-04-12').endStay).toMatchObject({
      stayId: 'sendai-candidate',
    });
  });
});

describe('needsDriving', () => {
  it('步行超過 30 分鐘才算開車', () => {
    expect(needsDriving(30 * 60)).toBe(false);
    expect(needsDriving(30 * 60 + 1)).toBe(true);
  });
});

describe('planItemLegs', () => {
  const row = (
    id: string,
    time_slot: 'morning' | 'afternoon',
    position: number,
    ...names: (string | null)[]
  ) => ({
    id,
    time_slot,
    start_time: null,
    position,
    item_places: names.map((name) => ({ name: name ?? '純文字', place_id: name && `id-${name}` })),
  });

  it('依當天順序（時段、手動順序）規劃，沒有地點 ID 的地點略過', () => {
    const legs = planItemLegs(
      [
        row('c', 'afternoon', 0, '晴空塔'),
        row('b', 'morning', 1, null, '仲見世通'),
        row('a', 'morning', 0, '淺草寺'),
      ],
      { startStay: stay('s1', '上野飯店'), endStay: null },
    );
    expect(route(legs)).toEqual(['上野飯店→淺草寺', '淺草寺→仲見世通', '仲見世通→晴空塔']);
  });
});

describe('legKey', () => {
  it('以起點與終點的地點 ID 對應', () => {
    const [leg] = planDayLegs({
      items: [item('a', '淺草寺'), item('b', '晴空塔')],
      startStay: null,
      endStay: null,
    });
    expect(legKey(leg)).toBe('id-淺草寺>id-晴空塔');
  });
});

describe('durationParts', () => {
  it('四捨五入到分鐘，至少 1 分鐘', () => {
    expect(durationParts(10)).toEqual({ hours: 0, minutes: 1 });
    expect(durationParts(12 * 60 + 29)).toEqual({ hours: 0, minutes: 12 });
    expect(durationParts(12 * 60 + 30)).toEqual({ hours: 0, minutes: 13 });
  });

  it('超過 60 分鐘拆成小時與分鐘', () => {
    expect(durationParts(60 * 60)).toEqual({ hours: 1, minutes: 0 });
    expect(durationParts(95 * 60)).toEqual({ hours: 1, minutes: 35 });
  });
});
