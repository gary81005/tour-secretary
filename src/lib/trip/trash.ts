// 與 purge_deleted_rows()（supabase/migrations/20261105000003）的 30 天一致。
export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// 垃圾桶顯示「還有 N 天永久刪除」。排程每天跑一次，所以無條件進位；過期但還沒清掉時顯示 0。
export function daysUntilPurge(deletedAt: string, now: Date): number {
  const purgeAt = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((purgeAt - now.getTime()) / DAY_MS));
}
