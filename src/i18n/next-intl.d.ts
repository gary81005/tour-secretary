import type auth from '../../messages/zh-TW/auth.json';
import type common from '../../messages/zh-TW/common.json';
import type importMessages from '../../messages/zh-TW/import.json';
import type trips from '../../messages/zh-TW/trips.json';
import type validation from '../../messages/zh-TW/validation.json';
import type { routing } from './routing';

// 讓 useTranslations / getTranslations 的 key 與 locale 有型別檢查；以 zh-TW 為準。
// 結構要和 src/i18n/request.ts 組出來的 messages 一致。
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof common & {
      auth: typeof auth;
      import: typeof importMessages;
      trips: typeof trips;
      validation: typeof validation;
    };
  }
}
