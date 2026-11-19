'use client';

import { CopyIcon, RefreshCwIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore, useTransition } from 'react';
import { toast } from 'sonner';
import { resetInviteLink } from '@/actions/members';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MAX_TRIP_MEMBERS } from '@/lib/trip/members';

type Props = {
  tripId: string;
  // 含語系前綴的路徑；完整網址在瀏覽器裡用目前的網域組出來。
  invitePath: string;
  memberCount: number;
};

const subscribeNothing = () => () => {};

// 主辦人的邀請連結（ADR 0005 Q7）：複製後貼到 LINE 群組；可以重設，舊連結立刻失效。
export function InviteLink({ tripId, invitePath, memberCount }: Props) {
  const t = useTranslations();
  const origin = useSyncExternalStore(
    subscribeNothing,
    () => window.location.origin,
    () => null,
  );
  const url = origin && `${origin}${invitePath}`;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('trips.members.copied'));
    } catch {
      toast.error(t('trips.members.copyFailed'));
    }
  }

  function reset() {
    startTransition(async () => {
      const result = await resetInviteLink(tripId);
      setConfirmOpen(false);
      if (result.ok) toast.success(t('trips.members.resetDone'));
      else toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <section
      aria-labelledby='invite-link-title'
      className='flex flex-col gap-3 rounded-xl border p-4'
    >
      <div className='flex flex-col gap-1'>
        <h3 id='invite-link-title' className='font-medium'>
          {t('trips.members.inviteTitle')}
        </h3>
        <p className='text-sm text-muted-foreground'>
          {t('trips.members.inviteDescription', { max: MAX_TRIP_MEMBERS })}
        </p>
      </div>
      <Input
        readOnly
        value={url ?? ''}
        aria-label={t('trips.members.inviteLinkLabel')}
        onFocus={(event) => event.currentTarget.select()}
        className='h-11 text-base'
      />
      {memberCount >= MAX_TRIP_MEMBERS && (
        <p className='text-sm text-destructive'>
          {t('trips.members.full', { max: MAX_TRIP_MEMBERS })}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button type='button' onClick={copy} disabled={!url}>
          <CopyIcon />
          {t('trips.members.copy')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
        >
          <RefreshCwIcon />
          {t('trips.members.reset')}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('trips.members.resetTitle')}</DialogTitle>
            <DialogDescription>{t('trips.members.resetDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type='button' variant='outline' />}>
              {t('trips.members.cancel')}
            </DialogClose>
            <Button type='button' onClick={reset} disabled={isPending} aria-busy={isPending}>
              {t('trips.members.resetConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
