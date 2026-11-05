'use client';

import {
  CalendarClockIcon,
  CalendarRangeIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { moveTripToTrash, restoreTrip } from '@/actions/trips';
import { buttonVariants } from '@/components/ui/button';
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
};

// 行程右上角的「⋯」選單（Q26-3）：編輯行程、整趟平移、修改起訖日、移到垃圾桶。
export function TripMenu({ trip, days }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<'edit' | 'shift' | 'dates' | null>(null);
  // 每次打開都換 key，對話框裡的表單（錯誤訊息、改到一半的值）重新開始；關閉時保留內容讓動畫跑完。
  const [dialogKey, setDialogKey] = useState(0);

  function openDialog(name: 'edit' | 'shift' | 'dates') {
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
    </>
  );
}
