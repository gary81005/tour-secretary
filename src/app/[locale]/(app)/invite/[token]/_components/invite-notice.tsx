import { CircleAlertIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { MAX_TRIP_MEMBERS } from '@/lib/trip/members';

type Props = { kind: 'invalid' | 'trashed' } | { kind: 'full'; tripName: string };

// 不能加入時的說明頁：連結失效（已重設或不存在）、行程在垃圾桶、人數已滿。
export function InviteNotice(props: Props) {
  const t = useTranslations('invite');
  const title =
    props.kind === 'full' ? t('fullTitle', { name: props.tripName }) : t(`${props.kind}Title`);
  const description =
    props.kind === 'full'
      ? t('fullDescription', { max: MAX_TRIP_MEMBERS })
      : t(`${props.kind}Description`);

  return (
    <section className='flex flex-col items-center gap-4 text-center'>
      <CircleAlertIcon className='size-10 text-muted-foreground' aria-hidden='true' />
      <div className='flex flex-col gap-2'>
        <h1 className='text-xl font-semibold tracking-tight break-words'>{title}</h1>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
      <Link href='/' className={buttonVariants({ variant: 'outline' })}>
        {t('backHome')}
      </Link>
    </section>
  );
}
