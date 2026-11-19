import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ActionErrorKey } from '@/lib/form';

// 表單或對話框的整體錯誤（不屬於某一個欄位），例如「找不到這個行程」。
// 單一欄位的錯誤用 ui/field 的 FieldError。沒有內容時不顯示。
export function FormError({ id, children }: { id?: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role='alert' className='text-sm text-destructive'>
      {children}
    </p>
  );
}

// Server Action 失敗時回傳的錯誤 key，翻成 common.json 的 errors。成功或還沒送出時不顯示。
export function ActionError({
  result,
}: {
  result: { ok: boolean; error?: ActionErrorKey } | null;
}) {
  const t = useTranslations('errors');
  return <FormError>{result && !result.ok && result.error && t(result.error)}</FormError>;
}
