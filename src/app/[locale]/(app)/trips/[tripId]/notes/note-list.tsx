'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'cn';
import { GripVerticalIcon, NotebookPenIcon, PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { reorderNotes } from '@/actions/notes';
import { ResponsiveDialog, ResponsiveDialogContent } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import type { TripNote } from '@/data/trips';
import { useEditorState } from '@/hooks/use-editor-state';
import { useDndAccessibility } from '../dnd-accessibility';
import { NoteForm } from './note-form';

// 提醒事項列表：拖拉把手調整順序（先樂觀更新，失敗時自動還原），點卡片編輯。
export function NoteList({ tripId, notes }: { tripId: string; notes: TripNote[] }) {
  const t = useTranslations();
  const dndId = useId();
  const editor = useEditorState<TripNote>();
  const [optimisticNotes, reorderOptimistic] = useOptimistic(
    notes,
    (current, orderedIds: string[]) =>
      orderedIds
        .map((id) => current.find((note) => note.id === id))
        .filter((note): note is TripNote => !!note),
  );
  const [, startReorder] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const accessibility = useDndAccessibility(
    (id) => optimisticNotes.find((note) => note.id === id)?.topic ?? '',
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = optimisticNotes.map((note) => note.id);
    const reordered = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    startReorder(async () => {
      reorderOptimistic(reordered);
      const result = await reorderNotes(tripId, reordered);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className='flex flex-col gap-3 pt-4'>
      {optimisticNotes.length === 0 ? (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <NotebookPenIcon />
            </EmptyMedia>
            <EmptyTitle>{t('trips.notes.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('trips.notes.empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={accessibility}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={optimisticNotes.map((note) => note.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className='flex flex-col gap-2'>
              {optimisticNotes.map((note) => (
                <SortableNote key={note.id} note={note} onEdit={() => editor.openEditor(note)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <Button variant='outline' size='lg' className='h-11' onClick={() => editor.openEditor(null)}>
        <PlusIcon />
        {t('trips.notes.add')}
      </Button>

      <ResponsiveDialog open={editor.open} onOpenChange={editor.setOpen}>
        {/* 欄位少，手機上不需要全高。 */}
        <ResponsiveDialogContent className='h-auto max-h-[92dvh]'>
          <NoteForm
            key={editor.key}
            tripId={tripId}
            note={editor.target}
            onDone={() => editor.setOpen(false)}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

function SortableNote({ note, onEdit }: { note: TripNote; onEdit: () => void }) {
  const t = useTranslations('trips');
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id, attributes: { roleDescription: t('dnd.roleDescription') } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'relative z-20 opacity-80 shadow-lg')}
    >
      <article className='relative flex gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50 has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50'>
        <button
          type='button'
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('notes.handle', { topic: note.topic })}
          className='relative z-10 -my-1 -ml-1 flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing'
        >
          <GripVerticalIcon className='size-4' />
        </button>
        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <h3 className='font-medium break-words'>
            <button
              type='button'
              onClick={onEdit}
              aria-label={t('notes.edit', { topic: note.topic })}
              className='text-left outline-none after:absolute after:inset-0 after:rounded-lg'
            >
              {note.topic}
            </button>
          </h3>
          {note.content && (
            <p className='text-sm break-words whitespace-pre-line text-muted-foreground'>
              {note.content}
            </p>
          )}
        </div>
      </article>
    </li>
  );
}
