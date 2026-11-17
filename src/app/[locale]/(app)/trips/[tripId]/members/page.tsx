import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getTripInviteToken, getTripMembers, isTripOwner } from '@/data/members';
import { getTrip } from '@/data/trips';
import { getPathname } from '@/i18n/navigation';
import { InviteLink } from './_components/invite-link';
import { LeaveTrip } from './_components/leave-trip';
import { MemberList } from './_components/member-list';

type Props = PageProps<'/[locale]/trips/[tripId]/members'>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trips.members');
  return { title: t('title') };
}

// 旅伴名單（ADR 0005「M5 旅伴與權限」Q9）：從行程的「⋯」選單進來。
// 主辦人：邀請連結（複製、重設）、移除旅伴。旅伴：退出行程。
export default function MembersPage({ params }: Props) {
  const t = useTranslations('trips.members');

  return (
    <div className='flex flex-col gap-6 py-6'>
      <h2 className='text-xl font-semibold tracking-tight'>{t('title')}</h2>
      <Suspense fallback={<div className='h-48 animate-pulse rounded-xl bg-muted' />}>
        <Members params={params} />
      </Suspense>
    </div>
  );
}

async function Members({ params }: Pick<Props, 'params'>) {
  const { tripId } = await params;
  // 行程不存在時 layout 已經 notFound()。
  const [trip, isOwner, members, token, locale] = await Promise.all([
    getTrip(tripId),
    isTripOwner(tripId),
    getTripMembers(tripId),
    // 邀請連結只有主辦人讀得到，旅伴不用查。
    isTripOwner(tripId).then((owner) => (owner ? getTripInviteToken(tripId) : null)),
    getLocale(),
  ]);

  return (
    <>
      {isOwner && token && (
        <InviteLink
          tripId={tripId}
          invitePath={getPathname({ href: `/invite/${token}`, locale })}
          memberCount={members.length}
        />
      )}
      <MemberList tripId={tripId} isOwner={isOwner} members={members} />
      {!isOwner && trip && <LeaveTrip tripId={tripId} tripName={trip.name} />}
    </>
  );
}
