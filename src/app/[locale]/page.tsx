import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { getCurrentUser } from '@/lib/auth/user';

// 第 3 步的暫時首頁：確認登入狀態。第 5 步會換成行程列表。
export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main className='mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8'>
      <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
      <Suspense fallback={<div className='h-24 rounded-lg border' aria-hidden='true' />}>
        <CurrentUserCard />
      </Suspense>
      <p className='text-sm text-muted-foreground'>{t('comingSoon')}</p>
    </main>
  );
}

async function CurrentUserCard() {
  const user = await getCurrentUser();

  return <CurrentUserView name={user.displayName} email={user.email} />;
}

function CurrentUserView({ name, email }: { name: string; email: string }) {
  const t = useTranslations('home');

  return (
    <div className='flex items-center justify-between gap-4 rounded-lg border px-4 py-3'>
      <div className='flex min-w-0 flex-col'>
        <span className='truncate font-medium'>{t('signedInAs', { name })}</span>
        <span className='truncate text-sm text-muted-foreground'>{email}</span>
      </div>
      <SignOutButton />
    </div>
  );
}
