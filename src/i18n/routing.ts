import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // 第一版只有繁中（ADR 0003）；之後加語系時在這裡補上，並新增 messages/<locale>/。
  locales: ['zh-TW'],
  defaultLocale: 'zh-TW',
  localePrefix: 'as-needed',
  // 只有一個語系時偵測沒有意義；補上 en-US 後再評估是否打開。
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
