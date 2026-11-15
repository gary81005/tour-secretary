'use client';

import { useTranslations } from 'next-intl';
import { StayCard } from '@/components/itinerary/stay-card';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { OfflineSnapshot } from '@/lib/offline/snapshot';
import { TRAVELER_CONSTRAINT_KINDS } from '@/lib/trip/enums';

// 離線行程頁的「住宿」「提醒」「限制」分頁，全部唯讀（ADR 0010 Q11）。
// 住宿沒寫地址時的 Google 地址沒有存（服務條款），只保留「在 Google 地圖開啟」連結。

export function OfflineStays({ stays }: { stays: OfflineSnapshot['stays'] }) {
  const t = useTranslations('offline');
  if (stays.length === 0) return <EmptyPanel title={t('staysEmpty')} />;

  return (
    <ul className='flex flex-col gap-2 pt-4'>
      {stays.map((stay) => (
        <li key={stay.id}>
          <StayCard stay={stay} />
        </li>
      ))}
    </ul>
  );
}

export function OfflineNotes({ notes }: { notes: OfflineSnapshot['notes'] }) {
  const t = useTranslations('offline');
  if (notes.length === 0) return <EmptyPanel title={t('notesEmpty')} />;

  return (
    <ul className='flex flex-col gap-2 pt-4'>
      {notes.map((note) => (
        <li key={note.id}>
          <article className='flex flex-col gap-1 rounded-lg border bg-card p-3'>
            <h3 className='font-medium break-words'>{note.topic}</h3>
            {note.content && (
              <p className='text-sm break-words whitespace-pre-line text-muted-foreground'>
                {note.content}
              </p>
            )}
          </article>
        </li>
      ))}
    </ul>
  );
}

// 依類型（飲食、體力、行動、偏好、其他）分組，只顯示有資料的類型。
export function OfflineConstraints({
  constraints,
}: {
  constraints: OfflineSnapshot['constraints'];
}) {
  const t = useTranslations();
  const groups = TRAVELER_CONSTRAINT_KINDS.map((kind) => ({
    kind,
    constraints: constraints.filter((constraint) => constraint.kind === kind),
  })).filter((group) => group.constraints.length > 0);
  if (groups.length === 0) return <EmptyPanel title={t('offline.constraintsEmpty')} />;

  return (
    <div className='flex flex-col gap-4 pt-4'>
      {groups.map((group) => (
        <section
          key={group.kind}
          className='flex flex-col gap-2'
          aria-labelledby={`kind-${group.kind}`}
        >
          <h3 id={`kind-${group.kind}`} className='text-sm font-medium text-muted-foreground'>
            {t(`trips.constraintKinds.${group.kind}`)}
          </h3>
          <ul className='flex flex-col gap-2'>
            {group.constraints.map((constraint) => (
              <li
                key={constraint.id}
                className='flex items-start gap-2 rounded-lg border bg-card p-3'
              >
                {constraint.subject && (
                  <Badge variant='secondary' className='shrink-0'>
                    {constraint.subject}
                  </Badge>
                )}
                <span className='min-w-0 break-words'>{constraint.content}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EmptyPanel({ title }: { title: string }) {
  return (
    <Empty className='mt-4 border'>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}
