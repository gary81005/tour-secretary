// 住宿的日期規則（Q23）：
// - 退房日要晚於入住日
// - 入住到退房要落在行程日期內，退房日可以是行程最後一天
// - 日期重疊（兩間房、換房）只提醒，不阻擋

export type StayDates = { check_in: string; check_out: string };

export type StayRangeError = 'checkOutNotAfterCheckIn' | 'outsideTrip';

export function validateStayRange(
  stay: StayDates,
  trip: { start_date: string; end_date: string },
): StayRangeError | null {
  if (stay.check_out <= stay.check_in) return 'checkOutNotAfterCheckIn';
  if (stay.check_in < trip.start_date || stay.check_out > trip.end_date) return 'outsideTrip';
  return null;
}

// 回傳和其他住宿有重疊的住宿 id。退房當天再入住另一間不算重疊。
export function findOverlappingStayIds(stays: readonly (StayDates & { id: string })[]) {
  const ids = new Set<string>();
  stays.forEach((a, i) => {
    stays.slice(i + 1).forEach((b) => {
      if (a.check_in < b.check_out && b.check_in < a.check_out) {
        ids.add(a.id);
        ids.add(b.id);
      }
    });
  });
  return ids;
}

// 某一晚住哪裡：入住日 ≤ date < 退房日。單日畫面底部的「今晚住」用這個。
export function staysForNight<T extends StayDates>(stays: readonly T[], date: string): T[] {
  return stays.filter((stay) => stay.check_in <= date && date < stay.check_out);
}
