import type { z } from 'zod';
import type { ValidationErrorKey } from '@/lib/trip/schemas';

// 欄位路徑（例如 'endDate'、'places.0.name'）→ 驗證錯誤的翻譯 key；同一欄只取第一個錯誤。
export type FieldErrors = Partial<Record<string, ValidationErrorKey>>;

export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    errors[path] ??= issue.message as ValidationErrorKey;
  }
  return errors;
}

// Server Action 的錯誤，翻譯在 common.json 的 errors。
export type ActionErrorKey =
  | 'unauthorized'
  | 'notFound'
  | 'nameMismatch'
  | 'conflict'
  | 'daysHaveItems'
  | 'tripTooLong'
  | 'lastDay'
  | 'invalidImport'
  | 'importNotUndoable'
  | 'ownerOnly'
  | 'tripFull'
  | 'nameRequired'
  | 'ownerCannotLeave'
  | 'invalidPlan'
  | 'adjustmentNotUndoable'
  | 'unknown';

export type ActionResult = { ok: true } | { ok: false; error: ActionErrorKey };

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

// 表單（useFormSubmit）送出的結果：成功，或欄位錯誤／整體錯誤。
export type FormResult =
  { ok: true } | { ok: false; fieldErrors?: FieldErrors; error?: ActionErrorKey };
