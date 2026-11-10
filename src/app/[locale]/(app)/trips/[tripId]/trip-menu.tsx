'use client';

import {
  CalendarClockIcon,
  CalendarRangeIcon,
  EllipsisVerticalIcon,
  FileSpreadsheetIcon,
  PencilIcon,
  Trash2Icon,
  Undo2Icon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { undoImport } from '@/actions/imports';
import { moveTripToTrash, restoreTrip } from '@/actions/trips';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from '@/i18n/navigation';
import {
  ChangeDatesDialog,
  EditTripDialog,
  ShiftTripDialog,
  type TripSettings,
} from './trip-settings-dialogs';

type Props = {
  trip: TripSettings;
  days: { id: string; date: string }[];
  // 還能復原的上次匯入（getUndoableImportId），沒有時不顯示「復原上次匯入」。
  undoableImportId: string | null;
};

type DialogName = 'edit' | 'shift' | 'dates' | 'undoImport';

// 行程右上角的「⋯」選單（Q26-3）：編輯行程、整趟平移、修改起訖日、匯入 xlsx、
// 復原上次匯入（ADR 0008 Q15）、移到垃圾桶。
export function TripMenu({ trip, days, undoableImportId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogName | null>(null);
  // 每次打開都換 key，對話框裡的表單（錯誤訊息、改到一半的值）重新開始；關閉時保留內容讓動畫跑完。
  const [dialogKey, setDialogKey] = useState(0);

  function openDialog(name: DialogName) {
    setDialogKey((key) => key + 1);
    setDialog(name);
  }

  function closeDialog(open: boolean) {
    if (!open) setDialog(null);
  }

  function moveToTrash() {
    startTransition(async () => {
      const result = await moveTripToTrash(trip.id);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t('trips.trip.movedToTrash', { name: trip.name }), {
        action: {
          label: t('trips.trip.undo'),
          onClick: async () => {
            const restored = await restoreTrip(trip.id);
            if (!restored.ok) toast.error(t(`errors.${restored.error}`));
          },
        },
      });
      router.replace('/');
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('trips.trip.menu')}
          className={buttonVariants({ variant: 'ghost', size: 'icon-lg' })}
          disabled={isPending}
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-48'>
          <DropdownMenuItem onClick={() => openDialog('edit')}>
            <PencilIcon />
            {t('trips.trip.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog('shift')}>
            <CalendarClockIcon />
            {t('trips.trip.shift')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog('dates')}>
            <CalendarRangeIcon />
            {t('trips.trip.changeDates')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/trips/${trip.id}/import`)}>
            <FileSpreadsheetIcon />
            {t('import.entry')}
          </DropdownMenuItem>
          {undoableImportId && (
            <DropdownMenuItem onClick={() => openDialog('undoImport')}>
              <Undo2Icon />
              {t('import.undo.menu')}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={moveToTrash}>
            <Trash2Icon />
            {t('trips.trip.moveToTrash')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditTripDialog
        key={dialogKey}
        trip={trip}
        open={dialog === 'edit'}
        onOpenChange={closeDialog}
      />
      <ShiftTripDialog
        key={dialogKey}
        trip={trip}
        open={dialog === 'shift'}
        onOpenChange={closeDialog}
      />
      <ChangeDatesDialog
        key={dialogKey}
        trip={trip}
        days={days}
        open={dialog === 'dates'}
        onOpenChange={closeDialog}
      />
      {undoableImportId && (
        <UndoImportDialog
          importId={undoableImportId}
          open={dialog === 'undoImport'}
          onOpenChange={closeDialog}
        />
      )}
    </>
  );
}

// 復原上次匯入：刪除這次新增的資料、還原被覆蓋的資料，影響範圍大，所以先確認。
function UndoImportDialog({
  importId,
  open,
  onOpenChange,
}: {
  importId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await undoImport(importId);
      onOpenChange(false);
      if (result.ok) toast.success(t('import.undo.done'));
      else toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('import.undo.title')}</DialogTitle>
          <DialogDescription>{t('import.undo.description')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type='button' variant='outline' />}>
            {t('import.cancel')}
          </DialogClose>
          <Button type='button' onClick={confirm} disabled={isPending} aria-busy={isPending}>
            {t('import.undo.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
