'use client';

import { LogOutIcon, Trash2Icon, UserPenIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { MemberAvatar } from '@/components/member/member-avatar';
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
import { clearOfflineData } from '@/lib/offline/clear';
import { createClient } from '@/lib/supabase/client';
import { DisplayNameDialog } from './display-name-dialog';

type Props = {
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
};

// 右上角的帳號選單：名稱與 Email、我的名稱、垃圾桶、登出。
export function UserMenu({ displayName, email, avatarUrl }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isSigningOut, startTransition] = useTransition();
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  // 每次打開都換 key，對話框的表單（錯誤訊息、改到一半的值）重新開始。
  const [nameDialogKey, setNameDialogKey] = useState(0);

  function openNameDialog() {
    setNameDialogKey((key) => key + 1);
    setNameDialogOpen(true);
  }

  // 登出後導去登入頁並重新整理，讓 Server Component 不再拿到舊的使用者資料。
  // 清掉這支手機上的離線資料（ADR 0010 Q12）：登出前清一次（登出請求失敗也不留資料），
  // 登出後再清一次——等登出請求的期間，行程頁可能剛存了新的快照；登出後伺服器不再給行程資料，不會再被寫回。
  function signOut() {
    startTransition(async () => {
      await clearOfflineData();
      await createClient().auth.signOut();
      await clearOfflineData();
      router.replace(LOGIN_PATH);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('appShell.accountMenu')}
          className='rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
        >
          <MemberAvatar name={displayName} avatarUrl={avatarUrl} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-56'>
          <DropdownMenuGroup>
            <DropdownMenuLabel className='flex flex-col gap-0.5'>
              {displayName ? (
                <span className='truncate text-sm text-foreground'>{displayName}</span>
              ) : (
                <span className='truncate text-sm'>{t('profile.noName')}</span>
              )}
              <span className='truncate font-normal'>{email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openNameDialog}>
            <UserPenIcon />
            {t('profile.menuItem')}
          </DropdownMenuItem>
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
      <DisplayNameDialog
        key={nameDialogKey}
        displayName={displayName}
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
      />
    </>
  );
}
