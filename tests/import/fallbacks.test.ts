import { describe, expect, it } from 'vitest';
import { matchFallbacks } from '@/lib/import/fallbacks';
import type { DraftFallback } from '@/lib/import/types';

const fallback = (key: string, date: string, itemTitle: string): DraftFallback => ({
  key,
  date,
  itemTitle,
  condition: null,
  alternative: '改逛溫泉街',
});

describe('matchFallbacks', () => {
  it('用日期＋標題比對，忽略空白與全形半形', () => {
    const result = matchFallbacks(
      [
        fallback('f1', '2027-03-09', ' 藏王纜車/樹冰 '),
        fallback('f2', '2027-03-10', '藏王纜車／樹冰'),
      ],
      [{ key: 'i1', date: '2027-03-09', title: '藏王纜車／樹冰' }],
    );
    expect(result.get('f1')?.key).toBe('i1');
    expect(result.get('f2')).toBeNull();
  });

  it('同一天有同名項目時取排在前面的（檔案優先於既有項目）', () => {
    const result = matchFallbacks(
      [fallback('f1', '2027-03-09', '樹冰')],
      [
        { key: 'file', date: '2027-03-09', title: '樹冰' },
        { key: 'existing', date: '2027-03-09', title: '樹冰' },
      ],
    );
    expect(result.get('f1')?.key).toBe('file');
  });
});
