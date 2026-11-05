import type messages from '../../messages/zh-TW/common.json';
import type { routing } from './routing';

// 讓 useTranslations / getTranslations 的 key 與 locale 有型別檢查；以 zh-TW 為準。
declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
