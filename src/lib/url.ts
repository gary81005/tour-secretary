// 只有 http(s) 網址才顯示成連結。表單有 zod 驗證，但資料也可能經由 API 直接寫入，
// 顯示前再擋一次，避免 javascript: 等網址變成 XSS 的入口。
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
