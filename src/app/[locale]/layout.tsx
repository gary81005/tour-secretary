import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Geist, Geist_Mono } from 'next/font/google';
import { locale } from 'next/root-params';
import { routing } from '@/i18n/routing';
import '../globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// cacheComponents 下每個 root param 至少要有一個值，否則 build 失敗。
export function generateStaticParams() {
  return routing.locales.map((value) => ({ locale: value }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: { default: t('name'), template: `%s｜${t('name')}` },
    description: t('tagline'),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default async function RootLayout({ children }: LayoutProps<'/[locale]'>) {
  return (
    <html
      lang={await locale()}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className='flex min-h-full flex-col'>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
