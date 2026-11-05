'use client';

import { EllipsisVerticalIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { moveTripToTrash, restoreTrip } from '@/actions/trips';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from '@/i18n/navigation';

// 行程右上角的「⋯」選單。第 9 步會加上改名稱、整趟平移、修改起訖日、預設時區。
export function TripMenu({ tripId, tripName }: { tripId: string; tripName: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function moveToTrash() {
    startTransition(async () => {
      const result = await moveTripToTrash(tripId);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t('trips.trip.movedToTrash', { name: tripName }), {
        action: {
          label: t('trips.trip.undo'),
          onClick: async () => {
            const restored = await restoreTrip(tripId);
            if (!restored.ok) toast.error(t(`errors.${restored.error}`));
          },
        },
      });
      router.replace('/');
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('trips.trip.menu')}
        className={buttonVariants({ variant: 'ghost', size: 'icon-lg' })}
        disabled={isPending}
      >
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48'>
        <DropdownMenuItem variant='destructive' onClick={moveToTrash}>
          <Trash2Icon />
          {t('trips.trip.moveToTrash')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
