'use client';

import { LogOutIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { LOGIN_PATH } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/client';

// 登出後導去登入頁並重新整理，讓 Server Component 不再拿到舊的使用者資料。
export function SignOutButton() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      await createClient().auth.signOut();
      router.replace(LOGIN_PATH);
      router.refresh();
    });
  }

  return (
    <Button variant='outline' onClick={signOut} disabled={isPending} aria-busy={isPending}>
      <LogOutIcon />
      {t('signOut')}
    </Button>
  );
}
