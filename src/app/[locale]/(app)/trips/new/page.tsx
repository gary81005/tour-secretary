import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { CreateTripForm } from './create-trip-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('trips.create');
  return { title: t('title') };
}

export default function NewTripPage() {
  const t = useTranslations('trips.create');

  return (
    <div className='flex flex-col gap-6 py-6'>
      <h1 className='text-2xl font-semibold tracking-tight'>{t('title')}</h1>
      <CreateTripForm />
    </div>
  );
}
