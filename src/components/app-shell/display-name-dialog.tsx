'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updateDisplayName } from '@/actions/profile';
import { ActionError } from '@/components/form-error';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/profile/display-name';

type Props = {
  displayName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// 帳號選單的「我的名稱」：旅伴在名單上看到的名稱。
export function DisplayNameDialog({ displayName, open, onOpenChange }: Props) {
  const t = useTranslations();
  const { result, isPending, handleSubmit } = useFormSubmit(updateDisplayName, () => {
    toast.success(t('profile.saved'));
    onOpenChange(false);
  });
  const fieldError = result && !result.ok ? result.fieldErrors?.displayName : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <form onSubmit={handleSubmit} className='flex flex-col gap-4' noValidate>
          <DialogHeader>
            <DialogTitle>{t('profile.title')}</DialogTitle>
            <DialogDescription>{t('profile.description')}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={!!fieldError}>
            <FieldLabel htmlFor='display-name'>{t('profile.nameLabel')}</FieldLabel>
            <Input
              id='display-name'
              name='displayName'
              defaultValue={displayName ?? ''}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              required
              autoComplete='nickname'
              className='h-11 text-base'
              aria-invalid={!!fieldError}
            />
            {fieldError && <FieldError>{t(`validation.${fieldError}`)}</FieldError>}
          </Field>
          <ActionError result={result} />
          <DialogFooter>
            <DialogClose render={<Button type='button' variant='outline' />}>
              {t('profile.cancel')}
            </DialogClose>
            <Button type='submit' disabled={isPending} aria-busy={isPending}>
              {t('profile.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
