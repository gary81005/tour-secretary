import dayjs from '@/lib/dayjs';
import type { CellRange, CellValue, SheetData } from './types';

export function columnLetters(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// row、col 從 0 起算，回傳 'A1' 格式。
export function cellAddress(row: number, col: number): string {
  return `${columnLetters(col)}${row + 1}`;
}

function parseAddress(address: string): { row: number; col: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  if (!match) return null;
  const col = [...match[1]].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(match[2]) - 1, col };
}

// 'A1:B2' → 範圍；格式不對時回傳 null。
export function parseRange(ref: string): CellRange | null {
  const [from, to = from] = ref.toUpperCase().split(':');
  const start = parseAddress(from);
  const end = parseAddress(to);
  if (!start || !end) return null;
  return {
    top: Math.min(start.row, end.row),
    left: Math.min(start.col, end.col),
    bottom: Math.max(start.row, end.row),
    right: Math.max(start.col, end.col),
  };
}

export function cellAt(sheet: SheetData, row: number, col: number): CellValue {
  return sheet.rows[row]?.[col] ?? null;
}

// 合併儲存格內的任一格都回傳左上角的值（例如城市跨三天合併）。
export function mergedValue(sheet: SheetData, row: number, col: number): CellValue {
  const range = sheet.merges.find(
    (r) => row >= r.top && row <= r.bottom && col >= r.left && col <= r.right,
  );
  return range ? cellAt(sheet, range.top, range.left) : cellAt(sheet, row, col);
}

// Excel 的時間值：1899-12-30 起算的天數，小數部分是一天中的時間。
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const MINUTES_PER_DAY = 24 * 60;

function isTimeOnly(date: Date): boolean {
  return date.getUTCFullYear() < 1901;
}

function minutesToTime(minutes: number): string {
  const total = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function dateToTime(date: Date): string {
  return minutesToTime(Math.round((date.getTime() - EXCEL_EPOCH) / 60_000));
}

function dateToIso(date: Date): string {
  return dayjs.utc(date).format('YYYY-MM-DD');
}

// 儲存格顯示的文字（已去掉前後空白）。日期是 'YYYY-MM-DD'，只有時間的是 'HH:MM'。
export function cellText(value: CellValue): string {
  if (value === null) return '';
  if (value instanceof Date) return isTimeOnly(value) ? dateToTime(value) : dateToIso(value);
  if (typeof value === 'object') return value.text.trim();
  return String(value).trim();
}

export function isBlank(value: CellValue): boolean {
  return cellText(value) === '';
}

export function isBlankRow(cells: readonly CellValue[] | undefined): boolean {
  return !cells || cells.every(isBlank);
}

// 時段欄可能是 Excel 的時間值（Date 或 0–1 之間的數字），轉成 'HH:MM' 再交給 parseTimeCell。
export function timeCellText(value: CellValue): string {
  if (typeof value === 'number' && value >= 0 && value < 1) {
    return minutesToTime(Math.round(value * MINUTES_PER_DAY));
  }
  return cellText(value);
}

// 連結欄：儲存格本身是超連結時取網址，否則取文字。
export function cellUrl(value: CellValue): string {
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return value.hyperlink.trim();
  }
  return cellText(value);
}

// 全形英數與符號轉半形（「１７：００」→「17:00」）。只用在日期、時間這類格式化的欄位。
export function toHalfWidth(text: string): string {
  return text
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

// 合理的 Excel 日期序號範圍（2000-01-01 到 2099-12-31），避免把一般數字當成日期。
const MIN_DATE_SERIAL = 36526;
const MAX_DATE_SERIAL = 73050;

// 「2027/3/5」「2027-03-05」「2027年3月5日」，可以帶星期，例如「2027/3/5（五）」。
const DATE_TEXT =
  /^(\d{4})\s*[/\-.年]\s*(\d{1,2})\s*[/\-.月]\s*(\d{1,2})\s*日?\s*(?:[(（][^)）]*[)）])?$/;

// 日期儲存格 → 'YYYY-MM-DD'；不是日期時回傳 null。沒有年份的文字（例如「3/5」）不接受。
export function parseDateCell(value: CellValue): string | null {
  if (value instanceof Date) return isTimeOnly(value) ? null : dateToIso(value);
  if (typeof value === 'number') {
    if (value < MIN_DATE_SERIAL || value > MAX_DATE_SERIAL) return null;
    return dateToIso(new Date(EXCEL_EPOCH + Math.floor(value) * MINUTES_PER_DAY * 60_000));
  }
  const match = DATE_TEXT.exec(toHalfWidth(cellText(value)));
  if (!match) return null;
  const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  // 2027-02-30 這種不存在的日期，dayjs 會進位成 3/2，格式化後就對不上。
  return dayjs.utc(iso).format('YYYY-MM-DD') === iso ? iso : null;
}
