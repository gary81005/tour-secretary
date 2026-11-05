'use client';

import { RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteTripPermanently, restoreTrip } from '@/actions/trips';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Props = { tripId: string; tripName: string };

export function TrashItemActions({ tripId, tripName }: Props) {
  const t = useTranslations();
  const [isRestoring, startRestore] = useTransition();

  function restore() {
    startRestore(async () => {
      const result = await restoreTrip(tripId);
      if (result.ok) toast.success(t('trips.trash.restored', { name: tripName }));
      else toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className='flex gap-2'>
      <Button variant='outline' onClick={restore} disabled={isRestoring} aria-busy={isRestoring}>
        <RotateCcwIcon />
        {t('trips.trash.restore')}
      </Button>
      <DeleteForeverDialog tripId={tripId} tripName={tripName} />
    </div>
  );
}

// 永久刪除前要輸入行程名稱確認（Q14），伺服器端也會再比對一次。
function DeleteForeverDialog({ tripId, tripName }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [isDeleting, startDelete] = useTransition();
  const matches = confirmName.trim() === tripName;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmName('');
  }

  function deleteForever() {
    startDelete(async () => {
      const result = await deleteTripPermanently(tripId, confirmName);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t('trips.trash.deleted', { name: tripName }));
      handleOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant='destructive' />}>
        <Trash2Icon />
        {t('trips.trash.deleteForever')}
      </DialogTrigger>
      {/* 預設的關閉按鈕文字寫死英文；這裡已有「取消」，不需要。 */}
      <DialogContent showCloseButton={false}>
        <form action={deleteForever} className='flex flex-col gap-4'>
          <DialogHeader>
            <DialogTitle>{t('trips.trash.deleteTitle', { name: tripName })}</DialogTitle>
            <DialogDescription>{t('trips.trash.deleteDescription')}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`confirm-${tripId}`}>
              {t('trips.trash.confirmNameLabel', { name: tripName })}
            </FieldLabel>
            <Input
              id={`confirm-${tripId}`}
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              autoComplete='off'
              className='h-11 text-base'
            />
          </Field>
          <DialogFooter>
            <DialogClose render={<Button type='button' variant='outline' />}>
              {t('trips.trash.cancel')}
            </DialogClose>
            <Button
              type='submit'
              variant='destructive'
              disabled={!matches || isDeleting}
              aria-busy={isDeleting}
            >
              {t('trips.trash.deleteForever')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
