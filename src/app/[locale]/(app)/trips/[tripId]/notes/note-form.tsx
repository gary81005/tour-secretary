'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { deleteNote, restoreNote, saveNote } from '@/actions/notes';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { TripNote } from '@/data/trips';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { EditorError, EditorFormShell } from '../editor-form-shell';

type Props = {
  tripId: string;
  // null 表示新增
  note: TripNote | null;
  onDone: () => void;
};

export function NoteForm({ tripId, note, onDone }: Props) {
  const t = useTranslations();
  const [isDeleting, startDelete] = useTransition();
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => saveNote(tripId, note?.id ?? null, formData),
    () => {
      toast.success(t('trips.editor.saved'));
      onDone();
    },
  );
  const errors = result && !result.ok ? result.fieldErrors : undefined;

  function handleDelete() {
    if (!note) return;
    startDelete(async () => {
      const deleted = await deleteNote(note.id);
      if (!deleted.ok) {
        toast.error(t(`errors.${deleted.error}`));
        return;
      }
      onDone();
      toast.success(t('trips.editor.deleted', { name: note.topic }), {
        action: {
          label: t('trips.editor.undo'),
          onClick: async () => {
            const restored = await restoreNote(note.id);
            if (!restored.ok) toast.error(t(`errors.${restored.error}`));
          },
        },
      });
    });
  }

  return (
    <EditorFormShell
      title={note ? t('trips.notes.editTitle') : t('trips.notes.createTitle')}
      onSubmit={handleSubmit}
      isSaving={isPending}
      onDelete={note ? handleDelete : undefined}
      isDeleting={isDeleting}
      error={
        <EditorError
          message={result && !result.ok && result.error ? t(`errors.${result.error}`) : null}
        />
      }
    >
      <Field data-invalid={!!errors?.topic}>
        <FieldLabel htmlFor='note-topic'>{t('trips.notes.topicLabel')}</FieldLabel>
        <Input
          id='note-topic'
          name='topic'
          defaultValue={note?.topic}
          placeholder={t('trips.notes.topicPlaceholder')}
          maxLength={100}
          required
          autoFocus={!note}
          className='h-11 text-base'
          aria-invalid={!!errors?.topic}
        />
        {errors?.topic && <FieldError>{t(`validation.${errors.topic}`)}</FieldError>}
      </Field>
      <Field data-invalid={!!errors?.content}>
        <FieldLabel htmlFor='note-content'>{t('trips.notes.contentLabel')}</FieldLabel>
        <Textarea
          id='note-content'
          name='content'
          defaultValue={note?.content ?? undefined}
          maxLength={5000}
          rows={6}
          className='text-base'
          aria-invalid={!!errors?.content}
        />
        {errors?.content && <FieldError>{t(`validation.${errors.content}`)}</FieldError>}
      </Field>
    </EditorFormShell>
  );
}
