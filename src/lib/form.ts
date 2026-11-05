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
export type ActionErrorKey = 'unauthorized' | 'notFound' | 'nameMismatch' | 'unknown';

export type ActionResult = { ok: true } | { ok: false; error: ActionErrorKey };

// 表單（useActionState）的狀態：失敗時把使用者填的值帶回去，避免整張表單被清空。
export type FormState<Values> = {
  values?: Values;
  fieldErrors?: FieldErrors;
  error?: ActionErrorKey;
};

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}
