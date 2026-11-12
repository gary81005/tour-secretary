'use client';

import { PlusIcon, UsersIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/responsive-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { TravelerConstraint } from '@/data/trips';
import { useEditorState } from '@/hooks/use-editor-state';
import { TRAVELER_CONSTRAINT_KINDS } from '@/lib/trip/enums';
import { ConstraintForm } from './constraint-form';

// 旅伴限制列表：依類型（飲食、體力、行動、偏好、其他）分組，只顯示有資料的類型。
export function ConstraintList({
  tripId,
  constraints,
}: {
  tripId: string;
  constraints: TravelerConstraint[];
}) {
  const t = useTranslations('trips');
  const editor = useEditorState<TravelerConstraint>();
  const groups = TRAVELER_CONSTRAINT_KINDS.map((kind) => ({
    kind,
    constraints: constraints.filter((constraint) => constraint.kind === kind),
  })).filter((group) => group.constraints.length > 0);

  return (
    <div className='flex flex-col gap-4 pt-4'>
      <p className='text-sm text-muted-foreground'>{t('constraints.description')}</p>

      {groups.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>{t('constraints.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('constraints.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        groups.map((group) => (
          <section
            key={group.kind}
            className='flex flex-col gap-2'
            aria-labelledby={`kind-${group.kind}`}
          >
            <h3 id={`kind-${group.kind}`} className='text-sm font-medium text-muted-foreground'>
              {t(`constraintKinds.${group.kind}`)}
            </h3>
            <ul className='flex flex-col gap-2'>
              {group.constraints.map((constraint) => (
                <li key={constraint.id}>
                  <article className='relative flex items-start gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50'>
                    {constraint.subject && (
                      <Badge variant='secondary' className='shrink-0'>
                        {constraint.subject}
                      </Badge>
                    )}
                    <button
                      type='button'
                      onClick={() => editor.openEditor(constraint)}
                      aria-label={t('constraints.edit', { content: constraint.content })}
                      className='min-w-0 text-left break-words outline-none after:absolute after:inset-0 after:rounded-lg'
                    >
                      {constraint.content}
                    </button>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Button variant='outline' size='lg' className='h-11' onClick={() => editor.openEditor(null)}>
        <PlusIcon />
        {t('constraints.add')}
      </Button>

      <ResponsiveDialog open={editor.open} onOpenChange={editor.setOpen}>
        {/* 欄位少，手機上不需要全高。 */}
        <ResponsiveDialogContent className='h-auto max-h-[92dvh]'>
          <ConstraintForm
            key={editor.key}
            tripId={tripId}
            constraint={editor.target}
            onDone={() => editor.setOpen(false)}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
