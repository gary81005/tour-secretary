'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { deleteConstraint, restoreConstraint, saveConstraint } from '@/actions/constraints';
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { TravelerConstraint } from '@/data/trips';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { TRAVELER_CONSTRAINT_KINDS } from '@/lib/trip/enums';
import { EditorError, EditorFormShell } from '../editor-form-shell';

type Props = {
  tripId: string;
  // null 表示新增
  constraint: TravelerConstraint | null;
  onDone: () => void;
};

export function ConstraintForm({ tripId, constraint, onDone }: Props) {
  const t = useTranslations();
  const [isDeleting, startDelete] = useTransition();
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => saveConstraint(tripId, constraint?.id ?? null, formData),
    () => {
      toast.success(t('trips.editor.saved'));
      onDone();
    },
  );
  const errors = result && !result.ok ? result.fieldErrors : undefined;

  function handleDelete() {
    if (!constraint) return;
    startDelete(async () => {
      const deleted = await deleteConstraint(constraint.id);
      if (!deleted.ok) {
        toast.error(t(`errors.${deleted.error}`));
        return;
      }
      onDone();
      toast.success(t('trips.editor.deleted', { name: constraint.content }), {
        action: {
          label: t('trips.editor.undo'),
          onClick: async () => {
            const restored = await restoreConstraint(constraint.id);
            if (!restored.ok) toast.error(t(`errors.${restored.error}`));
          },
        },
      });
    });
  }

  return (
    <EditorFormShell
      title={constraint ? t('trips.constraints.editTitle') : t('trips.constraints.createTitle')}
      onSubmit={handleSubmit}
      isSaving={isPending}
      onDelete={constraint ? handleDelete : undefined}
      isDeleting={isDeleting}
      error={
        <EditorError
          message={result && !result.ok && result.error ? t(`errors.${result.error}`) : null}
        />
      }
    >
      <FieldSet>
        <FieldLegend variant='label'>{t('trips.constraints.kindLabel')}</FieldLegend>
        <div className='grid grid-cols-3 gap-2'>
          {TRAVELER_CONSTRAINT_KINDS.map((kind) => (
            <label
              key={kind}
              className='flex cursor-pointer items-center justify-center rounded-lg border p-2 text-sm transition-colors has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50'
            >
              <input
                type='radio'
                name='kind'
                value={kind}
                defaultChecked={(constraint?.kind ?? 'diet') === kind}
                className='sr-only'
              />
              {t(`trips.constraintKinds.${kind}`)}
            </label>
          ))}
        </div>
        {errors?.kind && <FieldError>{t(`validation.${errors.kind}`)}</FieldError>}
      </FieldSet>

      <Field data-invalid={!!errors?.content}>
        <FieldLabel htmlFor='constraint-content'>{t('trips.constraints.contentLabel')}</FieldLabel>
        <Input
          id='constraint-content'
          name='content'
          defaultValue={constraint?.content}
          placeholder={t('trips.constraints.contentPlaceholder')}
          maxLength={1000}
          required
          autoFocus={!constraint}
          className='h-11 text-base'
          aria-invalid={!!errors?.content}
        />
        {errors?.content && <FieldError>{t(`validation.${errors.content}`)}</FieldError>}
      </Field>

      <Field data-invalid={!!errors?.subject}>
        <FieldLabel htmlFor='constraint-subject'>{t('trips.constraints.subjectLabel')}</FieldLabel>
        <Input
          id='constraint-subject'
          name='subject'
          defaultValue={constraint?.subject ?? undefined}
          placeholder={t('trips.constraints.subjectPlaceholder')}
          maxLength={50}
          className='h-11 text-base'
          aria-invalid={!!errors?.subject}
        />
        {errors?.subject && <FieldError>{t(`validation.${errors.subject}`)}</FieldError>}
      </Field>
    </EditorFormShell>
  );
}
