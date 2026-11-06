'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { setTripDates, shiftTrip, updateTrip } from '@/actions/trips';
import { TimezoneField } from '@/components/trip/timezone-field';
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormSubmit } from '@/hooks/use-form-submit';
import type { FieldErrors, FormResult } from '@/lib/form';
import { addDays, countDays, localDateToUtc, planDateRangeChange } from '@/lib/trip/trip-dates';

export type TripSettings = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  default_timezone: string;
};

type DialogProps = {
  trip: TripSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function fieldErrorsOf(result: { ok: boolean; fieldErrors?: FieldErrors } | null) {
  return result && !result.ok ? result.fieldErrors : undefined;
}

// 三個設定對話框共用的外框：標題、說明、內容、取消／儲存。
function SettingsDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  isPending,
  submitDisabled,
  error,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
  submitDisabled?: boolean;
  error?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('trips.settings');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={onSubmit} className='flex flex-col gap-4' noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          {error}
          <DialogFooter>
            <DialogClose render={<Button type='button' variant='outline' />}>
              {t('cancel')}
            </DialogClose>
            <Button type='submit' disabled={isPending || submitDisabled} aria-busy={isPending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionError({ result }: { result: FormResult | null }) {
  const t = useTranslations('errors');
  if (!result || result.ok || !result.error) return null;
  return (
    <p role='alert' className='text-sm text-destructive'>
      {t(result.error)}
    </p>
  );
}

// ---------------------------------------------------------------------------
// 編輯行程：名稱與預設時區
// ---------------------------------------------------------------------------

export function EditTripDialog({ trip, open, onOpenChange }: DialogProps) {
  const t = useTranslations();
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => updateTrip(trip.id, formData),
    () => {
      toast.success(t('trips.settings.saved'));
      onOpenChange(false);
    },
  );
  const errors = fieldErrorsOf(result);

  return (
    <SettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('trips.settings.edit.title')}
      onSubmit={handleSubmit}
      isPending={isPending}
      error={<ActionError result={result} />}
    >
      <Field data-invalid={!!errors?.name}>
        <FieldLabel htmlFor='trip-name'>{t('trips.settings.edit.nameLabel')}</FieldLabel>
        <Input
          id='trip-name'
          name='name'
          defaultValue={trip.name}
          maxLength={100}
          required
          className='h-11 text-base'
          aria-invalid={!!errors?.name}
        />
        {errors?.name && <FieldError>{t(`validation.${errors.name}`)}</FieldError>}
      </Field>
      <Field data-invalid={!!errors?.defaultTimezone}>
        <FieldLabel htmlFor='trip-timezone'>{t('trips.settings.edit.timezoneLabel')}</FieldLabel>
        <TimezoneField
          id='trip-timezone'
          name='defaultTimezone'
          defaultValue={trip.default_timezone}
          invalid={!!errors?.defaultTimezone}
        />
        {errors?.defaultTimezone ? (
          <FieldError>{t(`validation.${errors.defaultTimezone}`)}</FieldError>
        ) : (
          <FieldDescription>{t('trips.settings.edit.timezoneDescription')}</FieldDescription>
        )}
      </Field>
    </SettingsDialog>
  );
}

// ---------------------------------------------------------------------------
// 整趟平移：選新的出發日，天數不變
// ---------------------------------------------------------------------------

export function ShiftTripDialog({ trip, open, onOpenChange }: DialogProps) {
  const t = useTranslations();
  const format = useFormatter();
  const [startDate, setStartDate] = useState(trip.start_date);
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => shiftTrip(trip.id, formData),
    () => {
      toast.success(t('trips.settings.saved'));
      onOpenChange(false);
    },
  );
  const errors = fieldErrorsOf(result);
  const isValid = DATE_PATTERN.test(startDate);
  const unchanged = startDate === trip.start_date;
  const dayCount = countDays(trip.start_date, trip.end_date);

  return (
    <SettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('trips.settings.shift.title')}
      description={t('trips.settings.shift.description')}
      onSubmit={handleSubmit}
      isPending={isPending}
      submitDisabled={!isValid || unchanged}
      error={<ActionError result={result} />}
    >
      <Field data-invalid={!!errors?.startDate}>
        <FieldLabel htmlFor='shift-start'>{t('trips.settings.shift.startDateLabel')}</FieldLabel>
        <Input
          id='shift-start'
          name='startDate'
          type='date'
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          required
          className='h-11 text-base'
          aria-invalid={!!errors?.startDate}
        />
        {errors?.startDate && <FieldError>{t(`validation.${errors.startDate}`)}</FieldError>}
        <FieldDescription>
          {isValid && !unchanged
            ? t('trips.settings.shift.preview', {
                range: format.dateTimeRange(
                  localDateToUtc(startDate),
                  localDateToUtc(addDays(startDate, dayCount - 1)),
                  {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    weekday: 'short',
                    timeZone: 'UTC',
                  },
                ),
              })
            : t('trips.settings.shift.unchanged')}
        </FieldDescription>
      </Field>
    </SettingsDialog>
  );
}

// ---------------------------------------------------------------------------
// 修改起訖日：以日期對應，要刪的天有項目時由伺服器擋下（Q15）
// ---------------------------------------------------------------------------

export function ChangeDatesDialog({
  trip,
  days,
  open,
  onOpenChange,
}: DialogProps & { days: { id: string; date: string }[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const [startDate, setStartDate] = useState(trip.start_date);
  const [endDate, setEndDate] = useState(trip.end_date);
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => setTripDates(trip.id, formData),
    () => {
      toast.success(t('trips.settings.saved'));
      onOpenChange(false);
    },
  );
  const errors = fieldErrorsOf(result);

  const isValid =
    DATE_PATTERN.test(startDate) && DATE_PATTERN.test(endDate) && endDate >= startDate;
  const plan = isValid ? planDateRangeChange(days, startDate, endDate) : null;
  const unchanged = startDate === trip.start_date && endDate === trip.end_date;

  // 日期 → 「第 N 天（3/5）」，N 是目前的第幾天。
  function describeDays(dates: string[]) {
    return format.list(
      dates.map((date) =>
        t('trips.settings.dates.dayWithDate', {
          day: days.findIndex((day) => day.date === date) + 1,
          date: format.dateTime(localDateToUtc(date), {
            month: 'numeric',
            day: 'numeric',
            timeZone: 'UTC',
          }),
        }),
      ),
      { type: 'conjunction' },
    );
  }

  const blockedDates = result && !result.ok && 'blockedDates' in result ? result.blockedDates : [];

  return (
    <SettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('trips.settings.dates.title')}
      description={t('trips.settings.dates.description')}
      onSubmit={handleSubmit}
      isPending={isPending}
      submitDisabled={!isValid || unchanged}
      error={
        blockedDates.length > 0 ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('trips.settings.dates.blocked', { days: describeDays(blockedDates) })}
          </p>
        ) : (
          <ActionError result={result} />
        )
      }
    >
      <div className='grid grid-cols-2 gap-3'>
        <Field data-invalid={!!errors?.startDate}>
          <FieldLabel htmlFor='dates-start'>{t('trips.settings.dates.startDateLabel')}</FieldLabel>
          <Input
            id='dates-start'
            name='startDate'
            type='date'
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
            className='h-11 text-base'
            aria-invalid={!!errors?.startDate}
          />
          {errors?.startDate && <FieldError>{t(`validation.${errors.startDate}`)}</FieldError>}
        </Field>
        <Field data-invalid={!!errors?.endDate}>
          <FieldLabel htmlFor='dates-end'>{t('trips.settings.dates.endDateLabel')}</FieldLabel>
          <Input
            id='dates-end'
            name='endDate'
            type='date'
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
            className='h-11 text-base'
            aria-invalid={!!errors?.endDate}
          />
          {errors?.endDate && <FieldError>{t(`validation.${errors.endDate}`)}</FieldError>}
        </Field>
      </div>
      {plan && !unchanged && (
        <div className='flex flex-col gap-1 text-sm text-muted-foreground'>
          {plan.removed.length > 0 && (
            <p>
              {t('trips.settings.dates.willRemove', {
                days: describeDays(plan.removed.map((day) => day.date)),
              })}
            </p>
          )}
          {plan.added.length > 0 && (
            <p>{t('trips.settings.dates.willAdd', { count: plan.added.length })}</p>
          )}
        </div>
      )}
    </SettingsDialog>
  );
}
