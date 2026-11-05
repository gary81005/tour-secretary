'use client';

import { useState, useTransition, type FormEvent } from 'react';

// 表單送出 → Server Action → 成功時 onSuccess（例如關閉對話框、顯示提示）。
// 不用 <form action>：React 19 在 action 結束後會重設非受控欄位，驗證失敗時使用者的輸入會不見。
export function useFormSubmit<Result extends { ok: boolean }>(
  submit: (formData: FormData) => Promise<Result>,
  onSuccess: (result: Result) => void,
) {
  const [result, setResult] = useState<Result | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const next = await submit(formData);
      setResult(next);
      if (next.ok) onSuccess(next);
    });
  }

  return { result, isPending, handleSubmit };
}
