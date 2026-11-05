'use client';

import { CalendarPlusIcon, EllipsisVerticalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteDay, insertDayAfter, updateDay } from '@/actions/days';
import { TimezoneField } from '@/components/trip/timezone-field';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { useRouter } from '@/i18n/navigation';
import { COMMON_TIMEZONES } from '@/lib/trip/timezones';
import { localDateToUtc } from '@/lib/trip/trip-dates';

export type DayMenuDay = {
  id: string;
  dayNumber: number;
  date: string;
  city: string | null;
  // null 表示沿用行程預設
  timezone: string | null;
};

type Props = {
  tripId: string;
  day: DayMenuDay;
  // 之後的天（城市可以一次套用過去）
  laterDays: { dayNumber: number; date: string }[];
  dayCount: number;
  itemCount: number;
  defaultTimezone: string;
};

// 單日畫面右上角的「⋯」選單（第 9 步）：編輯這一天、在後面插入一天、刪除這一天。
export function DayMenu({ tripId, day, laterDays, dayCount, itemCount, defaultTimezone }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  // 每次打開都換 key，對話框裡的表單（錯誤訊息、改到一半的值）重新開始；關閉時保留內容讓動畫跑完。
  const [dialogKey, setDialogKey] = useState(0);

  function openDialog(name: 'edit' | 'delete') {
    setDialogKey((key) => key + 1);
    setDialog(name);
  }
  const [isPending, startTransition] = useTransition();

  function goToDay(dayNumber: number) {
    router.replace({ pathname: `/trips/${tripId}`, query: { day: dayNumber } }, { scroll: false });
  }

  function insertAfter() {
    startTransition(async () => {
      const result = await insertDayAfter(day.id);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t('trips.dayMenu.inserted', { day: day.dayNumber }));
      goToDay(day.dayNumber + 1);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('trips.dayMenu.label', { day: day.dayNumber })}
          className={buttonVariants({ variant: 'ghost', size: 'icon-lg' })}
          disabled={isPending}
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-48'>
          <DropdownMenuItem onClick={() => openDialog('edit')}>
            <PencilIcon />
            {t('trips.dayMenu.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={insertAfter} disabled={dayCount >= 60}>
            <CalendarPlusIcon />
            {t('trips.dayMenu.insertAfter')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant='destructive'
            onClick={() => openDialog('delete')}
            disabled={dayCount <= 1}
          >
            <Trash2Icon />
            {t('trips.dayMenu.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditDayDialog
        key={dialogKey}
        day={day}
        laterDays={laterDays}
        defaultTimezone={defaultTimezone}
        open={dialog === 'edit'}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <DeleteDayDialog
        key={dialogKey}
        day={day}
        itemCount={itemCount}
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        onDeleted={() => goToDay(Math.min(day.dayNumber, dayCount - 1))}
      />
    </>
  );
}

function EditDayDialog({
  day,
  laterDays,
  defaultTimezone,
  open,
  onOpenChange,
}: {
  day: DayMenuDay;
  laterDays: Props['laterDays'];
  defaultTimezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => updateDay(day.id, formData),
    () => {
      toast.success(t('trips.settings.saved'));
      onOpenChange(false);
    },
  );
  const errors = result && !result.ok ? result.fieldErrors : undefined;
  const isCommon = (COMMON_TIMEZONES as readonly string[]).includes(defaultTimezone);
  const defaultTimezoneLabel = isCommon
    ? t(`timezones.${defaultTimezone as (typeof COMMON_TIMEZONES)[number]}`)
    : defaultTimezone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={handleSubmit} className='flex flex-col gap-4' noValidate>
          <DialogHeader>
            <DialogTitle>{t('trips.dayMenu.editTitle', { day: day.dayNumber })}</DialogTitle>
          </DialogHeader>

          <Field data-invalid={!!errors?.city}>
            <FieldLabel htmlFor='day-city'>{t('trips.dayMenu.cityLabel')}</FieldLabel>
            <Input
              id='day-city'
              name='city'
              defaultValue={day.city ?? ''}
              placeholder={t('trips.dayMenu.cityPlaceholder')}
              maxLength={50}
              className='h-11 text-base'
              aria-invalid={!!errors?.city}
            />
            {errors?.city && <FieldError>{t(`validation.${errors.city}`)}</FieldError>}
          </Field>

          {laterDays.length > 0 && (
            <Field>
              <FieldLabel htmlFor='day-city-until'>{t('trips.dayMenu.cityUntilLabel')}</FieldLabel>
              <NativeSelect id='day-city-until' name='cityUntil' defaultValue='' className='w-full'>
                <NativeSelectOption value=''>
                  {t('trips.dayMenu.cityUntilOnlyThisDay')}
                </NativeSelectOption>
                {laterDays.map((later) => (
                  <NativeSelectOption key={later.date} value={later.date}>
                    {t('trips.dayMenu.cityUntilOption', {
                      day: later.dayNumber,
                      date: format.dateTime(localDateToUtc(later.date), {
                        month: 'numeric',
                        day: 'numeric',
                        timeZone: 'UTC',
                      }),
                    })}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}

          <Field data-invalid={!!errors?.timezone}>
            <FieldLabel htmlFor='day-timezone'>{t('trips.dayMenu.timezoneLabel')}</FieldLabel>
            <TimezoneField
              id='day-timezone'
              name='timezone'
              defaultValue={day.timezone ?? ''}
              inheritLabel={t('trips.dayMenu.inheritTimezone', {
                timezone: defaultTimezoneLabel,
              })}
              invalid={!!errors?.timezone}
            />
            {errors?.timezone && <FieldError>{t(`validation.${errors.timezone}`)}</FieldError>}
          </Field>

          {result && !result.ok && result.error && (
            <p role='alert' className='text-sm text-destructive'>
              {t(`errors.${result.error}`)}
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button type='button' variant='outline' />}>
              {t('trips.dayMenu.cancel')}
            </DialogClose>
            <Button type='submit' disabled={isPending} aria-busy={isPending}>
              {t('trips.settings.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// 刪除一天前一律確認；有項目時特別說明會一起刪除（Q15）。
function DeleteDayDialog({
  day,
  itemCount,
  open,
  onOpenChange,
  onDeleted,
}: {
  day: DayMenuDay;
  itemCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteDay(day.id);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t('trips.dayMenu.deleted', { day: day.dayNumber }));
      onOpenChange(false);
      onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('trips.dayMenu.deleteTitle', { day: day.dayNumber })}</DialogTitle>
          <DialogDescription>
            {itemCount > 0 && (
              <span className='block font-medium text-destructive'>
                {t('trips.dayMenu.deleteItems', { count: itemCount })}
              </span>
            )}
            {t('trips.dayMenu.deleteDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type='button' variant='outline' />}>
            {t('trips.dayMenu.cancel')}
          </DialogClose>
          <Button
            type='button'
            variant='destructive'
            onClick={confirmDelete}
            disabled={isPending}
            aria-busy={isPending}
          >
            {t('trips.dayMenu.deleteConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
