import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { type LegalSection, LegalDocument } from '@/components/legal/legal-document';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('terms');
  return { title: t('title') };
}

export default function TermsPage() {
  const t = useTranslations('terms');

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
