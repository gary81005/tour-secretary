'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { createTrip, type CreateTripValues } from '@/actions/trips';
import { TimezoneField } from '@/components/trip/timezone-field';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import type { FormState } from '@/lib/form';
import { DEFAULT_TIMEZONE } from '@/lib/trip/timezones';

const INITIAL_STATE: FormState<CreateTripValues> = {};

// 建立行程（Q21）：只填名稱、起訖日、時區，建好直接進第 1 天。
// 驗證在伺服器端（zod）；失敗時用回傳的 values 把使用者填的內容帶回表單。
export function CreateTripForm() {
  const t = useTranslations();
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState(
    createTrip.bind(null, locale),
    INITIAL_STATE,
  );
  const { values, fieldErrors } = state;

  function errorFor(field: keyof CreateTripValues) {
    const key = fieldErrors?.[field];
    return key && <FieldError id={`${field}-error`}>{t(`validation.${key}`)}</FieldError>;
  }

  return (
    <form action={formAction} className='flex flex-col gap-5' noValidate>
      <Field data-invalid={!!fieldErrors?.name}>
        <FieldLabel htmlFor='name'>{t('trips.create.nameLabel')}</FieldLabel>
        <Input
          id='name'
          name='name'
          defaultValue={values?.name}
          placeholder={t('trips.create.namePlaceholder')}
          maxLength={100}
          required
          autoFocus
          className='h-11 text-base'
          aria-invalid={!!fieldErrors?.name}
          aria-describedby={fieldErrors?.name ? 'name-error' : undefined}
        />
        {errorFor('name')}
      </Field>

      <div className='grid grid-cols-2 gap-3'>
        <Field data-invalid={!!fieldErrors?.startDate}>
          <FieldLabel htmlFor='startDate'>{t('trips.create.startDateLabel')}</FieldLabel>
          <Input
            id='startDate'
            name='startDate'
            type='date'
            defaultValue={values?.startDate}
            required
            className='h-11 text-base'
            aria-invalid={!!fieldErrors?.startDate}
            aria-describedby={fieldErrors?.startDate ? 'startDate-error' : undefined}
          />
          {errorFor('startDate')}
        </Field>
        <Field data-invalid={!!fieldErrors?.endDate}>
          <FieldLabel htmlFor='endDate'>{t('trips.create.endDateLabel')}</FieldLabel>
          <Input
            id='endDate'
            name='endDate'
            type='date'
            defaultValue={values?.endDate}
            required
            className='h-11 text-base'
            aria-invalid={!!fieldErrors?.endDate}
            aria-describedby={fieldErrors?.endDate ? 'endDate-error' : undefined}
          />
          {errorFor('endDate')}
        </Field>
      </div>

      <Field data-invalid={!!fieldErrors?.timezone}>
        <FieldLabel htmlFor='timezone'>{t('trips.create.timezoneLabel')}</FieldLabel>
        <TimezoneField
          id='timezone'
          name='timezone'
          defaultValue={values?.timezone || DEFAULT_TIMEZONE}
          invalid={!!fieldErrors?.timezone}
          describedBy={fieldErrors?.timezone ? 'timezone-error' : 'timezone-description'}
        />
        {errorFor('timezone') ?? (
          <FieldDescription id='timezone-description'>
            {t('trips.create.timezoneDescription')}
          </FieldDescription>
        )}
      </Field>

      {state.error && (
        <p role='alert' className='text-sm text-destructive'>
          {t(`errors.${state.error}`)}
        </p>
      )}

      <div className='flex justify-end gap-3'>
        <Link href='/' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {t('trips.create.cancel')}
        </Link>
        <Button type='submit' size='lg' disabled={isPending} aria-busy={isPending}>
          {t('trips.create.submit')}
        </Button>
      </div>
    </form>
  );
}
