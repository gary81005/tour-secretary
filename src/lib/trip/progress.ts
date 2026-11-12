// 旅途中的進度（ADR 0010「現在／下一站」）：項目手動按「完成」，記在 items.done_at。

// 今天與之前的天才能打勾；未來的天不顯示勾選框，避免誤按。
// date 是那一天的日期，today 是那一天時區的今天（都是 YYYY-MM-DD）。
export function canMarkDone(date: string, today: string): boolean {
  return date <= today;
}
