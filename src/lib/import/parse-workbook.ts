import { parseScheduleSheet } from './schedule-sheet';
import {
  parseConstraintsSheet,
  parseFallbacksSheet,
  parseNotesSheet,
  parseStaysSheet,
} from './table-sheets';
import type { ImportDraft, SheetData } from './types';
import { NON_SCHEDULE_SHEET_NAMES, SHEET_NAMES } from './vocabulary';

// 讀進來的工作表 → 匯入草稿（ADR 0008）。
// 每日行程是第一張「不是」住宿／提醒事項／備案／旅伴限制／說明的工作表，名稱不限；
// 其他四張依名稱比對，沒有的那一類是 null。
export function parseWorkbook(sheets: readonly SheetData[]): ImportDraft {
  const named = (name: string) => sheets.find((sheet) => sheet.name.trim() === name);
  const scheduleSheet = sheets.find(
    (sheet) => !NON_SCHEDULE_SHEET_NAMES.includes(sheet.name.trim()),
  );

  const schedule = scheduleSheet
    ? parseScheduleSheet(scheduleSheet)
    : { days: [], items: [], issues: [] };
  const staysSheet = named(SHEET_NAMES.stays);
  const stays = staysSheet && parseStaysSheet(staysSheet);
  const notesSheet = named(SHEET_NAMES.notes);
  const notes = notesSheet && parseNotesSheet(notesSheet);
  const fallbacksSheet = named(SHEET_NAMES.fallbacks);
  const fallbacks = fallbacksSheet && parseFallbacksSheet(fallbacksSheet);
  const constraintsSheet = named(SHEET_NAMES.constraints);
  const constraints = constraintsSheet && parseConstraintsSheet(constraintsSheet);

  return {
    scheduleSheet: scheduleSheet?.name ?? null,
    days: schedule.days,
    items: schedule.items,
    stays: stays?.stays ?? null,
    notes: notes?.notes ?? null,
    fallbacks: fallbacks?.fallbacks ?? null,
    constraints: constraints?.constraints ?? null,
    issues: [
      ...schedule.issues,
      ...(stays?.issues ?? []),
      ...(notes?.issues ?? []),
      ...(fallbacks?.issues ?? []),
      ...(constraints?.issues ?? []),
    ],
  };
}
