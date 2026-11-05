import { Suspense } from 'react';
import { getTravelerConstraints } from '@/data/trips';
import { ConstraintList } from './constraint-list';

type Props = PageProps<'/[locale]/trips/[tripId]/constraints'>;

// 旅伴限制分頁（Q9）：依類型分組。
export default function ConstraintsPage({ params }: Props) {
  return (
    <Suspense fallback={<div className='mt-4 h-24 animate-pulse rounded-lg bg-muted' />}>
      <Constraints params={params} />
    </Suspense>
  );
}

async function Constraints({ params }: Pick<Props, 'params'>) {
  const { tripId } = await params;
  // 行程不存在時 layout 已經 notFound()，這裡只需要讀旅伴限制。
  const constraints = await getTravelerConstraints(tripId);
  return <ConstraintList tripId={tripId} constraints={constraints} />;
}
