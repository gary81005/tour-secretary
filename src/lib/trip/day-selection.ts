// 行程分頁要顯示第幾天（從 0 起算）：
// 1. 網址的 ?day=N（從 1 起算）合法就用它
// 2. 否則進行中的行程顯示今天
// 3. 其他情況顯示第 1 天
export function resolveSelectedDayIndex(
  dayParam: string | undefined,
  dayCount: number,
  todayIndex: number,
): number {
  const day = Number(dayParam);
  if (Number.isInteger(day) && day >= 1 && day <= dayCount) return day - 1;
  return todayIndex >= 0 && todayIndex < dayCount ? todayIndex : 0;
}
