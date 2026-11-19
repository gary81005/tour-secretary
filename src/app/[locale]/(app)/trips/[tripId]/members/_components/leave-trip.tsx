'use client';

import { LogOutIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { leaveTrip } from '@/actions/members';
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
import { useRouter } from '@/i18n/navigation';

type Props = { tripId: string; tripName: string };

// 旅伴退出行程（ADR 0005 Q4）。他新增的內容留在行程裡；這支手機上的離線快照，回到首頁時清掉（ADR 0010）。
export function LeaveTrip({ tripId, tripName }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await leaveTrip(tripId);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t('trips.members.left', { name: tripName }));
      router.replace('/');
      // 首頁可能還在 client 的快取裡，重新整理才不會列出剛退出的行程。
      router.refresh();
    });
  }

  return (
    <div>
      <Button
        type='button'
        variant='outline'
        className='text-destructive'
        onClick={() => setOpen(true)}
      >
        <LogOutIcon />
        {t('trips.members.leave')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('trips.members.leaveTitle', { name: tripName })}</DialogTitle>
            <DialogDescription>{t('trips.members.leaveDescription')}</DialogDescription>
          </DialogHeader>
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
              {t('trips.members.leaveConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
