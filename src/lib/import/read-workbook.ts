import type { CellValue as ExcelCellValue, Worksheet } from 'exceljs';
import { parseRange } from './cells';
import { loadExcelJS } from './exceljs';
import type { CellRange, CellValue, SheetData } from './types';

// 只讀這個範圍內的儲存格；範本與一般行程表遠小於此，避免格式化過的空白欄列拖慢解析。
const MAX_ROWS = 2000;
const MAX_COLUMNS = 200;

// xlsx → SheetData[]。檔案不是 xlsx 或已損毀時，exceljs 會丟出例外，由呼叫端處理。
export async function readWorkbook(data: ArrayBuffer): Promise<SheetData[]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  // 隱藏的工作表不讀。
  return workbook.worksheets
    .filter((sheet) => sheet.state !== 'hidden' && sheet.state !== 'veryHidden')
    .map(toSheetData);
}

function toSheetData(worksheet: Worksheet): SheetData {
  const rowCount = Math.min(worksheet.rowCount, MAX_ROWS);
  const columnCount = Math.min(worksheet.columnCount, MAX_COLUMNS);
  const rows: CellValue[][] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const cells: CellValue[] = [];
    for (let c = 1; c <= columnCount; c++) {
      const cell = row.getCell(c);
      // 合併儲存格只保留左上角的值，exceljs 預設在每一格都回傳左上角的值。
      const isMergedChild = cell.isMerged && cell.master.address !== cell.address;
      cells.push(isMergedChild ? null : normalizeValue(cell.value));
    }
    rows.push(cells);
  }
  const merges = worksheet.model.merges
    .map(parseRange)
    .filter((range): range is CellRange => range !== null);
  return { name: worksheet.name, rows, merges };
}

function normalizeValue(value: ExcelCellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || value instanceof Date) return value;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('hyperlink' in value) {
    // 超連結的顯示文字也可能是 rich text。
    const text = normalizeValue(value.text as ExcelCellValue);
    return { text: typeof text === 'string' ? text : '', hyperlink: value.hyperlink };
  }
  if ('result' in value) return normalizeValue(value.result ?? null);
  // 公式沒有快取結果、或是 #N/A 這類錯誤值
  return null;
}
