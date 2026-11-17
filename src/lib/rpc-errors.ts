import type { ActionErrorKey } from '@/lib/form';

// 資料庫函式（supabase/migrations）拋出的錯誤 → 畫面上的錯誤 key。
// 錯誤碼：P0002 找不到或沒有權限（包含無效的邀請連結）；40001 資料已變動；
// 22023 / P0001 / 42501 用訊息區分原因（42501 owner_only：只有主辦人能做）。
export function rpcErrorKey(error: { code: string; message: string }): ActionErrorKey {
  if (error.code === 'P0002') return 'notFound';
  if (error.code === '40001') return 'conflict';
  switch (error.message) {
    case 'days_have_items':
      return 'daysHaveItems';
    case 'trip_too_long':
    case 'invalid_range':
      return 'tripTooLong';
    case 'last_day':
      return 'lastDay';
    case 'invalid_payload':
      return 'invalidImport';
    case 'import_not_undoable':
      return 'importNotUndoable';
    case 'owner_only':
      return 'ownerOnly';
    case 'trip_full':
      return 'tripFull';
    case 'name_required':
      return 'nameRequired';
    case 'owner_cannot_leave':
      return 'ownerCannotLeave';
    default:
      return 'unknown';
  }
}

// set_trip_dates 擋下時，detail 是還有項目的日期（逗號分隔）。
export function blockedDatesOf(error: { details?: string | null }): string[] {
  return (error.details ?? '').split(',').filter(Boolean);
}
