'use client';

import { useTranslations } from 'next-intl';
import { createTrip } from '@/actions/trips';
import { ActionError } from '@/components/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { Link, useRouter } from '@/i18n/navigation';
import { DEFAULT_TIMEZONE } from '@/lib/trip/timezones';
import { TimezoneField } from '../../_components/timezone-field';

// 建立行程（ADR 0004 Q21）：只填名稱、起訖日、時區，建好直接進第 1 天。
// 驗證在伺服器端（zod）；失敗時欄位維持使用者填的內容，只顯示錯誤。
export function CreateTripForm() {
  const t = useTranslations();
  const router = useRouter();
  const { result, isPending, handleSubmit } = useFormSubmit(createTrip, (created) => {
    if (created.ok) router.push(`/trips/${created.tripId}`);
  });
  const fieldErrors = result && !result.ok ? result.fieldErrors : undefined;
  // 建好之後到換頁之前，按鈕維持停用，避免重複建立。
  const isSubmitting = isPending || result?.ok === true;

  function errorFor(field: string) {
    const key = fieldErrors?.[field];
    return key && <FieldError id={`${field}-error`}>{t(`validation.${key}`)}</FieldError>;
  }

  return (
    <form onSubmit={handleSubmit} className='flex flex-col gap-5' noValidate>
      <Field data-invalid={!!fieldErrors?.name}>
        <FieldLabel htmlFor='name'>{t('trips.create.nameLabel')}</FieldLabel>
        <Input
          id='name'
          name='name'
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
          defaultValue={DEFAULT_TIMEZONE}
          invalid={!!fieldErrors?.timezone}
          describedBy={fieldErrors?.timezone ? 'timezone-error' : 'timezone-description'}
        />
        {errorFor('timezone') ?? (
          <FieldDescription id='timezone-description'>
            {t('trips.create.timezoneDescription')}
          </FieldDescription>
        )}
      </Field>

      <ActionError result={result} />

      <div className='flex justify-end gap-3'>
        <Link href='/' className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          {t('trips.create.cancel')}
        </Link>
        <Button type='submit' size='lg' disabled={isSubmitting} aria-busy={isSubmitting}>
          {t('trips.create.submit')}
        </Button>
      </div>
    </form>
  );
}
