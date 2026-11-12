import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';

// Web App Manifest（ADR 0010 Q6）：加到主畫面後以獨立視窗開啟。
// 這裡是 Route Handler，不能用 next/root-params，語系固定用預設語系。
// 圖示先由 public/trip.png 產生（白底），之後換高解析版；maskable 的圖案縮在中間的安全區內。
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: 'app' });

  return {
    id: '/',
    name: t('name'),
    short_name: t('name'),
    description: t('tagline'),
    lang: routing.defaultLocale,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    // 主色（globals.css 的 --primary，Tailwind teal-600）；manifest 不支援 oklch。
    theme_color: '#009689',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
