import { Suspense } from 'react';
import { getTripNotes } from '@/data/trips';
import { NoteList } from './note-list';

type Props = PageProps<'/[locale]/trips/[tripId]/notes'>;

// 提醒事項分頁（Q9、Q23）：主題 + 內容，可以拖拉排序。
export default function NotesPage({ params }: Props) {
  return (
    <Suspense fallback={<div className='mt-4 h-24 animate-pulse rounded-lg bg-muted' />}>
      <Notes params={params} />
    </Suspense>
  );
}

async function Notes({ params }: Pick<Props, 'params'>) {
  const { tripId } = await params;
  // 行程不存在時 layout 已經 notFound()，這裡只需要讀提醒事項。
  const notes = await getTripNotes(tripId);
  return <NoteList tripId={tripId} notes={notes} />;
}
