import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { safeNextPath } from '@/lib/auth/paths';
import { LoginForm, type LoginErrorKey } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth');
  return { title: t('title') };
}

type SearchParams = PageProps<'/[locale]/login'>['searchParams'];

// 標題與說明在靜態外殼裡；表單要讀 searchParams（next、error），放在 Suspense 裡。
export default function LoginPage({ searchParams }: PageProps<'/[locale]/login'>) {
  const t = useTranslations();

  return (
    <main className='mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-12'>
      <header className='flex flex-col gap-2 text-center'>
        <h1 className='text-2xl font-semibold tracking-tight'>{t('app.name')}</h1>
        <p className='text-sm text-muted-foreground'>{t('auth.subtitle')}</p>
      </header>

      <Suspense fallback={<div className='h-52' aria-hidden='true' />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// 只接受 Route Handler 會帶回來的兩種錯誤，其他值一律忽略。
const URL_ERRORS = new Set<LoginErrorKey>(['oauth', 'link']);

async function LoginFormWithParams({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const error = first(params.error) as LoginErrorKey | undefined;

  return (
    <LoginForm
      next={safeNextPath(first(params.next))}
      initialError={error && URL_ERRORS.has(error) ? error : null}
    />
  );
}
