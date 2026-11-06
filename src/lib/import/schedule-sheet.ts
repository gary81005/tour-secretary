import { countDays, MAX_TRIP_DAYS } from '@/lib/trip/trip-dates';
import {
  cellAddress,
  cellAt,
  cellText,
  isBlank,
  isBlankRow,
  mergedValue,
  parseDateCell,
  timeCellText,
} from './cells';
import { inferCategory, parseTimeCell, splitContent } from './schedule-cells';
import { collectIssues, type AddIssue } from './issues';
import type { DraftDay, DraftItem, ImportIssue, SheetData } from './types';

// 與資料庫的 check constraint 一致。
const CITY_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 5000;

const DATE_ROW = 0;
const CITY_ROW = 1;
const FIRST_ITEM_ROW = 2;

type DayColumn = { date: string; col: number };

export type ScheduleSheetResult = { days: DraftDay[]; items: DraftItem[]; issues: ImportIssue[] };

// 每日行程（ADR 0008）：第 1 列日期、第 2 列城市、每天 2 欄（時段｜內容），
// 從第 3 列讀到第一個整列空白為止。
export function parseScheduleSheet(sheet: SheetData): ScheduleSheetResult {
  const { issues, add: issue } = collectIssues(sheet.name);

  const columns = readDayColumns(sheet, issue);
  if (columns.length === 0) {
    if (!issues.length) issue('error', 'noDates', 'A1');
    return { days: [], items: [], issues };
  }

  const days = columns.map(({ date, col }): DraftDay => {
    const city =
      cellText(mergedValue(sheet, CITY_ROW, col)) || cellText(cellAt(sheet, CITY_ROW, col + 1));
    if (Array.from(city).length > CITY_MAX_LENGTH) {
      issue('error', 'tooLong', cellAddress(CITY_ROW, col), { max: CITY_MAX_LENGTH });
    }
    return { date, city: city || null };
  });

  const items: DraftItem[] = [];
  const endRow = findFirstBlankRow(sheet, FIRST_ITEM_ROW);
  for (let row = FIRST_ITEM_ROW; row < endRow; row++) {
    for (const { date, col } of columns) {
      const item = readItem(sheet, row, col, date, issue);
      if (item) items.push(item);
    }
  }

  const ignoredRow = sheet.rows.findIndex((cells, row) => row > endRow && !isBlankRow(cells));
  if (ignoredRow !== -1) {
    const col = sheet.rows[ignoredRow].findIndex((value) => !isBlank(value));
    issue('warning', 'rowsIgnored', cellAddress(ignoredRow, col), { row: ignoredRow + 1 });
  }

  return { days, items, issues };
}

function readDayColumns(sheet: SheetData, issue: AddIssue): DayColumn[] {
  const columns: DayColumn[] = [];
  (sheet.rows[DATE_ROW] ?? []).forEach((value, col) => {
    if (isBlank(value)) return;
    const address = cellAddress(DATE_ROW, col);
    const date = parseDateCell(value);
    if (!date) {
      issue('error', 'invalidDate', address, { value: cellText(value) });
      return;
    }
    const previous = columns.at(-1);
    if (previous && date === previous.date) {
      issue('error', 'duplicateDate', address, { value: date });
      return;
    }
    if (previous && date < previous.date) {
      issue('error', 'datesNotAscending', address, { value: date });
      return;
    }
    columns.push({ date, col });
  });

  if (columns.length > 0 && countDays(columns[0].date, columns.at(-1)!.date) > MAX_TRIP_DAYS) {
    issue('error', 'tooManyDays', cellAddress(DATE_ROW, columns.at(-1)!.col), {
      max: MAX_TRIP_DAYS,
    });
  }
  return columns;
}

function readItem(
  sheet: SheetData,
  row: number,
  col: number,
  date: string,
  issue: AddIssue,
): DraftItem | null {
  // 時段欄跨多列合併時，每一列都套用同一個時段。
  const timeRaw = timeCellText(mergedValue(sheet, row, col));
  const content = splitContent(cellText(cellAt(sheet, row, col + 1)));
  const timeAddress = cellAddress(row, col);
  const contentAddress = cellAddress(row, col + 1);

  if (!content) {
    // 合併進來的時段不算「有寫時段卻沒有內容」。
    if (!isBlank(cellAt(sheet, row, col))) issue('warning', 'emptyContent', timeAddress);
    return null;
  }

  const time = parseTimeCell(timeRaw);
  if (!time.recognized) issue('warning', 'timeSlotUnrecognized', timeAddress, { value: timeRaw });
  if (time.endTimeDropped) issue('warning', 'endTimeDropped', timeAddress, { value: timeRaw });
  if (content.truncated) issue('warning', 'titleTruncated', contentAddress);
  if (content.description && Array.from(content.description).length > DESCRIPTION_MAX_LENGTH) {
    issue('error', 'tooLong', contentAddress, { max: DESCRIPTION_MAX_LENGTH });
    return null;
  }

  const keyword = time.category ? null : inferCategory(content.title, content.description);
  return {
    key: `${sheet.name}!${contentAddress}`,
    date,
    row,
    timeSlot: time.timeSlot,
    startTime: time.startTime,
    endTime: time.endTime,
    category: time.category ?? keyword ?? 'sightseeing',
    categorySource: time.category ? 'timeCell' : keyword ? 'keyword' : 'default',
    timeSlotGuessed: !time.recognized,
    title: content.title,
    description: content.description,
  };
}

function findFirstBlankRow(sheet: SheetData, from: number): number {
  for (let row = from; row < sheet.rows.length; row++) {
    if (isBlankRow(sheet.rows[row])) return row;
  }
  return sheet.rows.length;
}
