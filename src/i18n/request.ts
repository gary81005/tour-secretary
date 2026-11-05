import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { routing } from './routing';

// 語系來自 root layout 的 [locale] 區段（next/root-params），與 cacheComponents 相容，
// 不需要 setRequestLocale。next/root-params 在 Server Action 與 Route Handler 中不可用，
// 在那裡呼叫 getTranslations 時要明確傳入 { locale }。
export default getRequestConfig(async ({ locale }) => {
  const requested = locale ?? (await rootLocale());
  if (!hasLocale(routing.locales, requested)) notFound();

  return {
    locale: requested,
    // common.json 展開在頂層，其他檔案各自是一個 namespace（檔名即 namespace）。
    messages: {
      ...(await import(`../../messages/${requested}/common.json`)).default,
      auth: (await import(`../../messages/${requested}/auth.json`)).default,
    },
  };
});
