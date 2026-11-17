'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { joinTrip } from '@/actions/members';
import { MemberAvatar } from '@/components/member/member-avatar';
import { TripDateRange } from '@/components/trip/trip-date-range';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { JoinableTripInvite } from '@/data/members';
import { useFormSubmit } from '@/hooks/use-form-submit';
import { useRouter } from '@/i18n/navigation';
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/profile/display-name';

type Props = {
  token: string;
  invite: JoinableTripInvite;
  // 還沒有名稱：先填名稱才能加入（Q13）。
  needsName: boolean;
};

// 邀請的確認頁：看清楚是哪個行程、誰邀請的，按「加入」才加入（Q8）。
export function JoinTripForm({ token, invite, needsName }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { result, isPending, handleSubmit } = useFormSubmit(
    (formData) => joinTrip(token, formData),
    (joined) => {
      if (!joined.ok) return;
      toast.success(t('invite.joined', { name: invite.name }));
      router.replace(`/trips/${joined.tripId}`);
      // 頂部列在共用的 layout 裡，換頁不會重新讀取；加入時填的名稱要重新整理才會出現。
      router.refresh();
    },
  );
  const fieldError = result && !result.ok ? result.fieldErrors?.displayName : undefined;
  const actionError = result && !result.ok ? result.error : undefined;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className='flex flex-col gap-6 rounded-xl border p-5 sm:p-6'
    >
      <div className='flex flex-col gap-2'>
        <p className='text-sm text-muted-foreground'>{t('invite.title')}</p>
        <h1 className='text-2xl font-semibold tracking-tight break-words'>
          {t('invite.heading', { name: invite.name })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          <TripDateRange startDate={invite.startDate} endDate={invite.endDate} />
        </p>
      </div>

      <div className='flex items-center gap-3'>
        <MemberAvatar name={invite.ownerName} avatarUrl={invite.ownerAvatarUrl} />
        <div className='flex min-w-0 flex-col text-sm'>
          <span className='truncate'>
            {invite.ownerName
              ? t('invite.ownerName', { name: invite.ownerName })
              : t('invite.owner')}
          </span>
          <span className='text-muted-foreground'>
            {t('invite.memberCount', { count: invite.memberCount })}
          </span>
        </div>
      </div>

      {needsName && (
        <Field data-invalid={!!fieldError}>
          <FieldLabel htmlFor='join-display-name'>{t('invite.nameLabel')}</FieldLabel>
          <Input
            id='join-display-name'
            name='displayName'
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            required
            autoComplete='nickname'
            className='h-11 text-base'
            aria-invalid={!!fieldError}
          />
          {fieldError ? (
            <FieldError>{t(`validation.${fieldError}`)}</FieldError>
          ) : (
            <FieldDescription>{t('invite.nameDescription')}</FieldDescription>
          )}
        </Field>
      )}

      {actionError && (
        <p role='alert' className='text-sm text-destructive'>
          {t(`errors.${actionError}`)}
        </p>
      )}

      <Button type='submit' size='lg' disabled={isPending} aria-busy={isPending}>
        {t('invite.join')}
      </Button>
    </form>
  );
}
