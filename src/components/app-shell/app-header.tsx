import { MapIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth/user';
import { UserMenu } from './user-menu';

// 頂部列：左邊回到行程列表，右邊是帳號選單。
// 帳號選單要讀 session，放在 Suspense 裡；其餘部分是靜態外殼，會立刻顯示。
export function AppHeader() {
  const t = useTranslations();

  return (
    <header className='sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75'>
      <div className='mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-4 px-4'>
        <Link
          href='/'
          aria-label={t('appShell.home')}
          className='flex items-center gap-2 rounded-md font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
        >
          <MapIcon className='size-5 text-primary' aria-hidden='true' />
          {t('app.name')}
        </Link>
        <Suspense fallback={<div className='size-8 rounded-full bg-muted' aria-hidden='true' />}>
          <UserMenuWithUser />
        </Suspense>
      </div>
    </header>
  );
}

async function UserMenuWithUser() {
  const user = await getCurrentUser();
  return <UserMenu displayName={user.displayName} email={user.email} avatarUrl={user.avatarUrl} />;
}
