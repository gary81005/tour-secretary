import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getTripInvite } from '@/data/members';
import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/lib/auth/user';
import { InviteNotice } from './_components/invite-notice';
import { JoinTripForm } from './_components/join-trip-form';

type Props = PageProps<'/[locale]/invite/[token]'>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invite');
  return { title: t('title') };
}

// 邀請連結（ADR 0005「M5 旅伴與權限」Q8）。要登入：沒登入時 proxy 導去登入頁（next 帶著這個網址），
// 登入頁看到是邀請連結會說明「有人邀請你加入行程」。登入後：
// - 可以加入：確認頁（行程名稱、日期、主辦人、目前幾位旅伴），沒有名稱的人先填名稱
// - 已經是旅伴：直接進行程
// - 連結失效、行程在垃圾桶、人數已滿：說明頁
export default function InvitePage({ params }: Props) {
  return (
    <div className='flex flex-1 flex-col justify-center py-10'>
      <Suspense fallback={<div className='h-72 animate-pulse rounded-xl bg-muted' />}>
        <Invite params={params} />
      </Suspense>
    </div>
  );
}

async function Invite({ params }: Pick<Props, 'params'>) {
  const { token } = await params;
  const [invite, user, locale] = await Promise.all([
    getTripInvite(token),
    getCurrentUser(),
    getLocale(),
  ]);

  if (!invite) return <InviteNotice kind='invalid' />;
  if (invite.status === 'trashed') return <InviteNotice kind='trashed' />;
  if (invite.status === 'member') redirect({ href: `/trips/${invite.tripId}`, locale });
  if (invite.status === 'full') return <InviteNotice kind='full' tripName={invite.name} />;

  return <JoinTripForm token={token} invite={invite} needsName={user.displayName === null} />;
}
