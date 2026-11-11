import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { type LegalSection, LegalDocument } from '@/components/legal/legal-document';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy');
  return { title: t('title') };
}

export default function PrivacyPage() {
  const t = useTranslations('privacy');

  return (
    <LegalDocument
      title={t('title')}
      updatedAt={t('updatedAt')}
      intro={t('intro')}
      // 條文是有順序的陣列，用 raw 取出。
      sections={t.raw('sections') as LegalSection[]}
      contactLabel={t('contactLabel')}
      contactEmail={t('contactEmail')}
    />
  );
}
