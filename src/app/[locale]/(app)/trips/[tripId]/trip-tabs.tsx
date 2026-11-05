'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const TABS = [
  { key: 'itinerary', path: '' },
  { key: 'stays', path: '/stays' },
  { key: 'notes', path: '/notes' },
  { key: 'constraints', path: '/constraints' },
] as const;

export function TripTabs({ tripId }: { tripId: string }) {
  const t = useTranslations('trips.tabs');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className='-mx-4 flex border-b px-4'>
      {TABS.map((tab) => {
        const href = `/trips/${tripId}${tab.path}`;
        const isActive = pathname === href;
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className='-mb-px flex-1 border-b-2 border-transparent py-2.5 text-center text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:border-primary aria-[current=page]:text-foreground'
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
