'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { deleteStay, restoreStay, saveStay } from '@/actions/stays';
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { TripStay } from '@/data/trips';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { STAY_STATUSES } from '@/lib/trip/enums';
import { EditorError, EditorFormShell } from '../editor-form-shell';

export type StayTrip = { id: string; startDate: string; endDate: string };

type Props = {
  trip: StayTrip;
  // null 表示新增
  stay: TripStay | null;
  defaults: { checkIn: string; checkOut: string };
  onDone: () => void;
};

// 住宿的新增／編輯表單（Q8）。入住到退房要在行程日期內（伺服器端也會檢查）。
export function StayForm({ trip, stay, defaults, onDone }: Props) {
  const t = useTranslations();
  const [isDeleting, startDelete] = useTransition();
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => saveStay(trip.id, stay?.id ?? null, formData),
    () => {
      toast.success(t('trips.editor.saved'));
      onDone();
    },
  );
  const errors = result && !result.ok ? result.fieldErrors : undefined;

  function errorFor(field: string) {
    const key = errors?.[field];
    return key && <FieldError>{t(`validation.${key}`)}</FieldError>;
  }

  function handleDelete() {
    if (!stay) return;
    startDelete(async () => {
      const deleted = await deleteStay(stay.id);
      if (!deleted.ok) {
        toast.error(t(`errors.${deleted.error}`));
        return;
      }
      onDone();
      toast.success(t('trips.editor.deleted', { name: stay.name }), {
        action: {
          label: t('trips.editor.undo'),
          onClick: async () => {
            const restored = await restoreStay(stay.id);
            if (!restored.ok) toast.error(t(`errors.${restored.error}`));
          },
        },
      });
    });
  }

  return (
    <EditorFormShell
      title={stay ? t('trips.stays.editTitle') : t('trips.stays.createTitle')}
      onSubmit={handleSubmit}
      isSaving={isPending}
      onDelete={stay ? handleDelete : undefined}
      isDeleting={isDeleting}
      error={
        <EditorError
          message={result && !result.ok && result.error ? t(`errors.${result.error}`) : null}
        />
      }
    >
      <Field data-invalid={!!errors?.name}>
        <FieldLabel htmlFor='stay-name'>{t('trips.stays.nameLabel')}</FieldLabel>
        <Input
          id='stay-name'
          name='name'
          defaultValue={stay?.name}
          placeholder={t('trips.stays.namePlaceholder')}
          maxLength={200}
          required
          autoFocus={!stay}
          className='h-11 text-base'
          aria-invalid={!!errors?.name}
        />
        {errorFor('name')}
      </Field>

      <div className='grid grid-cols-2 gap-3'>
        <Field data-invalid={!!errors?.checkIn}>
          <FieldLabel htmlFor='stay-check-in'>{t('trips.stays.checkInLabel')}</FieldLabel>
          <Input
            id='stay-check-in'
            name='checkIn'
            type='date'
            defaultValue={stay?.check_in ?? defaults.checkIn}
            min={trip.startDate}
            max={trip.endDate}
            required
            className='h-11 text-base'
            aria-invalid={!!errors?.checkIn}
          />
          {errorFor('checkIn')}
        </Field>
        <Field data-invalid={!!errors?.checkOut}>
          <FieldLabel htmlFor='stay-check-out'>{t('trips.stays.checkOutLabel')}</FieldLabel>
          <Input
            id='stay-check-out'
            name='checkOut'
            type='date'
            defaultValue={stay?.check_out ?? defaults.checkOut}
            min={trip.startDate}
            max={trip.endDate}
            required
            className='h-11 text-base'
            aria-invalid={!!errors?.checkOut}
          />
          {errorFor('checkOut')}
        </Field>
      </div>

      <FieldSet>
        <FieldLegend variant='label'>{t('trips.stays.statusLabel')}</FieldLegend>
        <div className='grid grid-cols-3 gap-2'>
          {STAY_STATUSES.map((status) => (
            <label
              key={status}
              className='flex cursor-pointer items-center justify-center rounded-lg border p-2 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50'
            >
              <input
                type='radio'
                name='status'
                value={status}
                defaultChecked={(stay?.status ?? 'candidate') === status}
                className='sr-only'
              />
              {t(`trips.stayStatus.${status}`)}
            </label>
          ))}
        </div>
        {errorFor('status')}
      </FieldSet>

      <Field data-invalid={!!errors?.address}>
        <FieldLabel htmlFor='stay-address'>{t('trips.stays.addressLabel')}</FieldLabel>
        <Input
          id='stay-address'
          name='address'
          defaultValue={stay?.address ?? undefined}
          maxLength={500}
          className='h-11 text-base'
          aria-invalid={!!errors?.address}
        />
        {errorFor('address')}
      </Field>

      <Field data-invalid={!!errors?.confirmationCode}>
        <FieldLabel htmlFor='stay-code'>{t('trips.stays.confirmationCodeLabel')}</FieldLabel>
        <Input
          id='stay-code'
          name='confirmationCode'
          defaultValue={stay?.confirmation_code ?? undefined}
          maxLength={100}
          autoComplete='off'
          className='h-11 text-base'
          aria-invalid={!!errors?.confirmationCode}
        />
        {errorFor('confirmationCode')}
      </Field>

      <Field data-invalid={!!errors?.url}>
        <FieldLabel htmlFor='stay-url'>{t('trips.stays.urlLabel')}</FieldLabel>
        <Input
          id='stay-url'
          name='url'
          type='url'
          inputMode='url'
          defaultValue={stay?.url ?? undefined}
          placeholder={t('trips.item.urlPlaceholder')}
          maxLength={2000}
          className='h-11 text-base'
          aria-invalid={!!errors?.url}
        />
        {errorFor('url')}
      </Field>

      <Field data-invalid={!!errors?.note}>
        <FieldLabel htmlFor='stay-note'>{t('trips.stays.noteLabel')}</FieldLabel>
        <Textarea
          id='stay-note'
          name='note'
          defaultValue={stay?.note ?? undefined}
          placeholder={t('trips.stays.notePlaceholder')}
          maxLength={5000}
          rows={3}
          className='text-base'
          aria-invalid={!!errors?.note}
        />
        {errorFor('note')}
      </Field>
    </EditorFormShell>
  );
}
