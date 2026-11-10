'use server';

import { refresh } from 'next/cache';
import { getSignedInClient } from '@/lib/auth/session';
import {
  fieldErrorsOf,
  type ActionErrorKey,
  type ActionResult,
  type FieldErrors,
} from '@/lib/form';
import {
  importNewTripSchema,
  importPayloadSchema,
  type ImportNewTripValues,
  type ValidImportPayload,
} from '@/lib/import/payload-schema';
import type { ImportPayload } from '@/lib/import/selection';
import { rpcErrorKey } from '@/lib/rpc-errors';
import { validateStayRange } from '@/lib/trip/stays';
import { isUuid } from '@/lib/uuid';

// xlsx 匯入的 Server Actions（ADR 0008）。檔案在瀏覽器解析，這裡收預覽確認後的結構化資料，
// zod 再驗一次後呼叫 import_trip（同一個 transaction 寫入，失敗時全部不留）。
// 完成後由呼叫端導頁：新建時到第 1 天，否則到檔案的第一個日期；附加／覆蓋要顯示「復原」提示。

export type ImportTripResult =
  | { ok: true; tripId: string; importId: string | null }
  | { ok: false; error?: ActionErrorKey; fieldErrors?: FieldErrors };

// 匯入成新行程。名稱與預設時區在預覽中設定，欄位錯誤回到那兩個欄位。
export async function importNewTrip(
  values: ImportNewTripValues,
  payload: ImportPayload,
): Promise<ImportTripResult> {
  const parsedValues = importNewTripSchema.safeParse(values);
  if (!parsedValues.success) return { ok: false, fieldErrors: fieldErrorsOf(parsedValues.error) };

  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.days.length === 0) {
    return { ok: false, error: 'invalidImport' };
  }
  if (!staysWithin(parsed.data, null)) return { ok: false, error: 'invalidImport' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data, error } = await supabase.rpc('import_trip', {
    p_payload: parsed.data,
    p_name: parsedValues.data.name,
    p_timezone: parsedValues.data.timezone,
  });
  if (error) return { ok: false, error: rpcErrorKey(error) };
  const row = data[0];
  if (!row) return { ok: false, error: 'unknown' };

  // 新建行程的匯入不記錄 trip_imports（import_id 是 null），要復原就把整趟移到垃圾桶。
  return { ok: true, tripId: row.trip_id, importId: null };
}

// 附加或覆蓋到既有行程。成功時回傳這次匯入的 id，給「復原」用。
export async function importIntoTrip(
  tripId: string,
  mode: 'append' | 'overwrite',
  payload: ImportPayload,
): Promise<ImportTripResult> {
  if (!isUuid(tripId) || (mode !== 'append' && mode !== 'overwrite')) {
    return { ok: false, error: 'notFound' };
  }

  const parsed = importPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'invalidImport' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { data: trip } = await supabase
    .from('trips')
    .select('start_date, end_date')
    .eq('id', tripId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!trip) return { ok: false, error: 'notFound' };

  if (!staysWithin(parsed.data, trip)) return { ok: false, error: 'invalidImport' };

  const { data, error } = await supabase.rpc('import_trip', {
    p_payload: parsed.data,
    p_trip_id: tripId,
    p_mode: mode,
  });
  if (error) return { ok: false, error: rpcErrorKey(error) };
  const row = data[0];
  if (!row?.import_id) return { ok: false, error: 'unknown' };

  refresh();
  return { ok: true, tripId: row.trip_id, importId: row.import_id };
}

// 住宿要落在匯入後的行程範圍內：檔案的日期，既有行程再加上原本的範圍（只會延長，不會縮短）。
// 這條規則不在資料庫把關，預覽擋過之後這裡再檢查一次。
function staysWithin(
  payload: ValidImportPayload,
  trip: { start_date: string; end_date: string } | null,
): boolean {
  const dates = payload.days.map((day) => day.date);
  if (trip) dates.push(trip.start_date, trip.end_date);
  dates.sort();
  const range = { start_date: dates[0], end_date: dates.at(-1)! };
  return (payload.stays ?? []).every((stay) => validateStayRange(stay, range) === null);
}

// 復原上次匯入（Q15）：只有行程最近一次、30 天內、尚未復原的匯入可以復原，由 undo_import() 判斷。
export async function undoImport(importId: string): Promise<ActionResult> {
  if (!isUuid(importId)) return { ok: false, error: 'notFound' };

  const supabase = await getSignedInClient();
  if (!supabase) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase.rpc('undo_import', { p_import_id: importId });
  if (error) return { ok: false, error: rpcErrorKey(error) };

  refresh();
  return { ok: true };
}
