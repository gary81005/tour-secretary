import dayjs from '@/lib/dayjs';
import type { StayStatus } from '@/lib/trip/enums';
import { staysForNight, type StayDates } from '@/lib/trip/stays';

// 一天裡要算的移動（ADR 0006 Q9）：
// - 前一個項目的最後一個連結地點 → 下一個項目的第一個連結地點；沒有連結地點的項目跳過
// - 一天的開頭：前一晚的住宿 → 第一個項目；結尾：最後一個項目 → 當晚的住宿
// - 同一個項目內的多個地點不算；起點與終點是同一個地點時不算

export type LinkedPlace = { placeId: string; name: string };

export type LegStop =
  | { kind: 'item'; itemId: string; place: LinkedPlace }
  | { kind: 'stay'; stayId: string; place: LinkedPlace };

export type Leg = { from: LegStop; to: LegStop };

// 步行超過 30 分鐘才另外算開車。
export const DRIVE_WHEN_WALK_OVER_SECONDS = 30 * 60;

export function needsDriving(walkSeconds: number): boolean {
  return walkSeconds > DRIVE_WHEN_WALK_OVER_SECONDS;
}

// items 要已經依當天順序排好（sortItems）；places 依項目內的順序，沒有連結的地點是 null。
export function planDayLegs(input: {
  items: readonly { id: string; places: readonly (LinkedPlace | null)[] }[];
  startStay: LegStop | null;
  endStay: LegStop | null;
}): Leg[] {
  const itemStops = input.items.flatMap((item) => {
    const linked = item.places.filter((place): place is LinkedPlace => place !== null);
    if (linked.length === 0) return [];
    const stop = (place: LinkedPlace): LegStop => ({ kind: 'item', itemId: item.id, place });
    return [{ first: stop(linked[0]), last: stop(linked[linked.length - 1]) }];
  });

  const legs: Leg[] = [];
  const add = (from: LegStop, to: LegStop) => {
    if (from.place.placeId !== to.place.placeId) legs.push({ from, to });
  };

  const firstItem = itemStops[0];
  const lastItem = itemStops[itemStops.length - 1];
  if (input.startStay && firstItem) add(input.startStay, firstItem.first);
  itemStops.slice(1).forEach((stop, index) => add(itemStops[index].last, stop.first));
  if (lastItem && input.endStay) add(lastItem.last, input.endStay);
  // 整天沒有連結地點的項目：直接從前一晚的住宿到當晚的住宿（換飯店的移動日）。
  if (!firstItem && input.startStay && input.endStay) add(input.startStay, input.endStay);

  return legs;
}

type StayWithPlace = StayDates & { id: string; status: StayStatus; place: LinkedPlace | null };

// 一天的頭尾：前一晚與當晚住的地方。同一晚有好幾間時（候選、換房），已預訂／已付款的優先，
// 其次是第一間有連結地點的。
export function dayStayStops(
  stays: readonly StayWithPlace[],
  date: string,
): { startStay: LegStop | null; endStay: LegStop | null } {
  const previousNight = dayjs.utc(date).subtract(1, 'day').format('YYYY-MM-DD');
  return {
    startStay: stayStop(staysForNight(stays, previousNight)),
    endStay: stayStop(staysForNight(stays, date)),
  };
}

function stayStop(stays: readonly StayWithPlace[]): LegStop | null {
  const linked = stays.filter((stay) => stay.place !== null);
  const stay = linked.find((candidate) => candidate.status !== 'candidate') ?? linked[0];
  return stay?.place ? { kind: 'stay', stayId: stay.id, place: stay.place } : null;
}
