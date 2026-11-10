import dayjs from '@/lib/dayjs';

// 「復原上次匯入」的條件（ADR 0008 Q15），與 undo_import() 一致：
// 行程最近一次的匯入、尚未復原、30 天內（之後 purge_deleted_rows 會清掉紀錄與被替換的資料）。
export const UNDO_IMPORT_DAYS = 30;

export function isImportUndoable(
  latest: { created_at: string; undone_at: string | null },
  now: Date,
): boolean {
  return (
    latest.undone_at === null &&
    !dayjs.utc(latest.created_at).add(UNDO_IMPORT_DAYS, 'day').isBefore(now)
  );
}
