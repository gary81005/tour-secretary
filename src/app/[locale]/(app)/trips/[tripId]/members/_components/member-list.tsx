'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { removeMember } from '@/actions/members';
import { MemberAvatar } from '@/components/member/member-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MAX_TRIP_MEMBERS, type TripMember } from '@/lib/trip/members';

type Props = {
  tripId: string;
  isOwner: boolean;
  members: TripMember[];
};

// 旅伴名單：頭像、名稱、主辦人標記、「（你）」，不顯示 Email（ADR 0005 Q9）。主辦人可以移除旅伴。
export function MemberList({ tripId, isOwner, members }: Props) {
  const t = useTranslations('trips.members');
  // 要移除的旅伴：關閉對話框時保留，讓關閉動畫跑完。
  const [removing, setRemoving] = useState<TripMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // 每次打開都換 key，「同時重設邀請連結」回到預設打勾。
  const [dialogKey, setDialogKey] = useState(0);

  function openRemove(member: TripMember) {
    setDialogKey((key) => key + 1);
    setRemoving(member);
    setDialogOpen(true);
  }

  return (
    <section aria-labelledby='member-list-title' className='flex flex-col gap-3'>
      <div className='flex items-baseline justify-between gap-3'>
        <h3 id='member-list-title' className='font-medium'>
          {t('listTitle')}
        </h3>
        <span className='text-sm text-muted-foreground tabular-nums'>
          {t('count', { count: members.length, max: MAX_TRIP_MEMBERS })}
        </span>
      </div>
      <ul className='flex flex-col divide-y rounded-xl border'>
        {members.map((member) => (
          <li key={member.userId} className='flex min-h-14 items-center gap-3 px-4 py-2'>
            <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} />
            <span className='min-w-0 flex-1 truncate'>
              {member.displayName ?? <span className='text-muted-foreground'>{t('noName')}</span>}
              {member.isSelf && <span className='text-muted-foreground'>{t('you')}</span>}
            </span>
            {member.role === 'owner' && (
              <Badge variant='secondary' className='shrink-0'>
                {t('owner')}
              </Badge>
            )}
            {isOwner && member.role === 'member' && (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='shrink-0 text-destructive'
                onClick={() => openRemove(member)}
              >
                {t('remove')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && removing && (
        <RemoveMemberDialog
          key={dialogKey}
          tripId={tripId}
          member={removing}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </section>
  );
}

function RemoveMemberDialog({
  tripId,
  member,
  open,
  onOpenChange,
}: {
  tripId: string;
  member: TripMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const [resetInvite, setResetInvite] = useState(true);
  const [isPending, startTransition] = useTransition();
  const name = member.displayName ?? t('trips.members.noName');

  function confirm() {
    startTransition(async () => {
      const result = await removeMember(tripId, member.userId, resetInvite);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      onOpenChange(false);
      toast.success(t('trips.members.removed', { name }));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('trips.members.removeTitle', { name })}</DialogTitle>
          <DialogDescription>{t('trips.members.removeDescription')}</DialogDescription>
        </DialogHeader>
        <label className='flex items-start gap-2.5 text-sm'>
          <Checkbox
            className='mt-0.5'
            checked={resetInvite}
            onCheckedChange={(checked) => setResetInvite(checked)}
          />
          <span className='flex flex-col gap-0.5'>
            <span>{t('trips.members.resetWithRemove')}</span>
            <span className='text-muted-foreground'>
              {t('trips.members.resetWithRemoveDescription')}
            </span>
          </span>
        </label>
        <DialogFooter>
          <DialogClose render={<Button type='button' variant='outline' />}>
            {t('trips.members.cancel')}
          </DialogClose>
          <Button
            type='button'
            variant='destructive'
            onClick={confirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {t('trips.members.removeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
