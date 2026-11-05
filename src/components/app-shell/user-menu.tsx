'use client';

import { LogOutIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link, useRouter } from '@/i18n/navigation';
import { LOGIN_PATH } from '@/lib/auth/paths';
import { createClient } from '@/lib/supabase/client';

type Props = {
  displayName: string;
  email: string;
  avatarUrl: string | null;
};

// 右上角的帳號選單：名稱與 Email、垃圾桶、登出。
export function UserMenu({ displayName, email, avatarUrl }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isSigningOut, startTransition] = useTransition();

  // 登出後導去登入頁並重新整理，讓 Server Component 不再拿到舊的使用者資料。
  function signOut() {
    startTransition(async () => {
      await createClient().auth.signOut();
      router.replace(LOGIN_PATH);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('appShell.accountMenu')}
        className='rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
      >
        <Avatar>
          {/* Google 頭像不帶 referrer，否則偶爾會被擋。 */}
          {avatarUrl && <AvatarImage src={avatarUrl} alt='' referrerPolicy='no-referrer' />}
          <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuGroup>
          <DropdownMenuLabel className='flex flex-col gap-0.5'>
            <span className='truncate text-sm text-foreground'>{displayName}</span>
            <span className='truncate font-normal'>{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href='/trash' />}>
          <Trash2Icon />
          {t('appShell.trash')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} disabled={isSigningOut}>
          <LogOutIcon />
          {t('auth.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
