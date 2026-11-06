import { parseRange } from '@/lib/import/cells';
import type { CellRange, CellValue, SheetData } from '@/lib/import/types';

// 用二維陣列建立測試用的工作表；merges 用 'A1:B1' 表示。
export function sheet(name: string, rows: CellValue[][], merges: string[] = []): SheetData {
  return {
    name,
    rows,
    merges: merges.map(parseRange).filter((range): range is CellRange => range !== null),
  };
}

// Excel 日期儲存格讀進來是 UTC 午夜的 Date。
export const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
