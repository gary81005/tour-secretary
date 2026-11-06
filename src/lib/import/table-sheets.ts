import { isSafeHttpUrl } from '@/lib/url';
import {
  cellAddress,
  cellAt,
  cellText,
  cellUrl,
  isBlank,
  isBlankRow,
  parseDateCell,
} from './cells';
import { collectIssues, type AddIssue } from './issues';
import type {
  CellValue,
  DraftConstraint,
  DraftFallback,
  DraftNote,
  DraftStay,
  ImportIssue,
  ImportIssueCode,
  SheetData,
} from './types';
import {
  CONSTRAINT_KIND_LABELS,
  reverseLookup,
  STAY_STATUS_LABELS,
  TABLE_HEADERS,
} from './vocabulary';

// 住宿、提醒事項、備案、旅伴限制（ADR 0008）：第 1 列是標題列，之後一列一筆。
// 長度上限與資料庫的 check constraint 一致；有錯誤的列不放進結果。

type Headers<K extends string> = Record<K, string>;

type TableRow<K extends string> = {
  // 從 0 起算
  row: number;
  value: (key: K) => CellValue;
  address: (key: K) => string;
};

// 範本在必填欄位的標題後面加「*」。
function normalizeHeader(text: string): string {
  return text.replace(/[*＊\s]/g, '');
}

function readTable<K extends string>(
  sheet: SheetData,
  headers: Headers<K>,
  required: readonly NoInfer<K>[],
  add: AddIssue,
): TableRow<K>[] {
  const headerCells = sheet.rows[0] ?? [];
  const columns = new Map<K, number>();
  for (const key of Object.keys(headers) as K[]) {
    const col = headerCells.findIndex((value) => normalizeHeader(cellText(value)) === headers[key]);
    if (col !== -1) columns.set(key, col);
  }

  const missing = required.filter((key) => !columns.has(key));
  missing.forEach((key) => add('error', 'missingColumn', null, { column: headers[key] }));
  if (missing.length > 0) return [];

  return sheet.rows.flatMap((cells, row) => {
    if (row === 0 || isBlankRow(cells)) return [];
    const colOf = (key: K) => columns.get(key);
    return [
      {
        row,
        value: (key: K) => {
          const col = colOf(key);
          return col === undefined ? null : cellAt(sheet, row, col);
        },
        address: (key: K) => cellAddress(row, colOf(key) ?? 0),
      },
    ];
  });
}

// 讀一列的各個欄位；任何欄位有錯誤時 ok() 回傳 false。
function fieldReader<K extends string>(row: TableRow<K>, headers: Headers<K>, add: AddIssue) {
  let ok = true;
  const report = (
    severity: ImportIssue['severity'],
    code: ImportIssueCode,
    key: K,
    params?: Record<string, string | number>,
  ) => {
    if (severity === 'error') ok = false;
    add(severity, code, row.address(key), { column: headers[key], ...params });
  };

  const text = (key: K, max: number): string | null => {
    const value = cellText(row.value(key));
    if (!value) return null;
    if (Array.from(value).length > max) {
      report('error', 'tooLong', key, { max });
      return null;
    }
    return value;
  };

  return {
    ok: () => ok,
    text,
    requiredText: (key: K, max: number): string => {
      if (isBlank(row.value(key))) {
        report('error', 'required', key);
        return '';
      }
      return text(key, max) ?? '';
    },
    date: (key: K): string => {
      const value = row.value(key);
      if (isBlank(value)) {
        report('error', 'required', key);
        return '';
      }
      const date = parseDateCell(value);
      if (!date) report('error', 'invalidDate', key, { value: cellText(value) });
      return date ?? '';
    },
    // 選項欄：回傳對應的 enum 值；空白回傳 null，認不出來回傳 undefined。
    option: <V extends string>(key: K, labels: Record<V, string>): V | null | undefined => {
      const value = cellText(row.value(key));
      if (!value) return null;
      return reverseLookup(labels, value);
    },
    url: (key: K): string | null => {
      const value = cellUrl(row.value(key));
      if (!value) return null;
      if (!isSafeHttpUrl(value)) {
        report('warning', 'invalidUrl', key, { value });
        return null;
      }
      if (value.length > 2000) {
        report('error', 'tooLong', key, { max: 2000 });
        return null;
      }
      return value;
    },
    warn: (code: ImportIssueCode, key: K, params?: Record<string, string | number>) =>
      report('warning', code, key, params),
    error: (code: ImportIssueCode, key: K, params?: Record<string, string | number>) =>
      report('error', code, key, params),
  };
}

const rowKey = (sheet: SheetData, row: number) => `${sheet.name}!${row + 1}`;

export function parseStaysSheet(sheet: SheetData): { stays: DraftStay[]; issues: ImportIssue[] } {
  const { issues, add } = collectIssues(sheet.name);
  const headers = TABLE_HEADERS.stays;
  const rows = readTable(sheet, headers, ['name', 'checkIn', 'checkOut'], add);

  const stays = rows.flatMap((row): DraftStay[] => {
    const field = fieldReader(row, headers, add);
    const name = field.requiredText('name', 200);
    const checkIn = field.date('checkIn');
    const checkOut = field.date('checkOut');
    if (checkIn && checkOut && checkOut <= checkIn)
      field.error('checkOutNotAfterCheckIn', 'checkOut');

    let status = field.option('status', STAY_STATUS_LABELS);
    if (status === undefined) {
      field.warn('unknownStatus', 'status', { value: cellText(row.value('status')) });
      status = null;
    }

    const stay: DraftStay = {
      key: rowKey(sheet, row.row),
      name,
      checkIn,
      checkOut,
      address: field.text('address', 500),
      status: status ?? 'candidate',
      confirmationCode: field.text('confirmationCode', 100),
      url: field.url('url'),
      note: field.text('note', 5000),
    };
    return field.ok() ? [stay] : [];
  });
  return { stays, issues };
}

export function parseNotesSheet(sheet: SheetData): { notes: DraftNote[]; issues: ImportIssue[] } {
  const { issues, add } = collectIssues(sheet.name);
  const headers = TABLE_HEADERS.notes;
  const rows = readTable(sheet, headers, ['topic'], add);

  const notes = rows.flatMap((row): DraftNote[] => {
    const field = fieldReader(row, headers, add);
    const note: DraftNote = {
      key: rowKey(sheet, row.row),
      topic: field.requiredText('topic', 100),
      content: field.text('content', 5000),
    };
    return field.ok() ? [note] : [];
  });
  return { notes, issues };
}

export function parseFallbacksSheet(sheet: SheetData): {
  fallbacks: DraftFallback[];
  issues: ImportIssue[];
} {
  const { issues, add } = collectIssues(sheet.name);
  const headers = TABLE_HEADERS.fallbacks;
  const rows = readTable(sheet, headers, ['date', 'itemTitle', 'alternative'], add);

  const fallbacks = rows.flatMap((row): DraftFallback[] => {
    const field = fieldReader(row, headers, add);
    const fallback: DraftFallback = {
      key: rowKey(sheet, row.row),
      date: field.date('date'),
      itemTitle: field.requiredText('itemTitle', 1000),
      condition: field.text('condition', 500),
      alternative: field.requiredText('alternative', 1000),
    };
    return field.ok() ? [fallback] : [];
  });
  return { fallbacks, issues };
}

export function parseConstraintsSheet(sheet: SheetData): {
  constraints: DraftConstraint[];
  issues: ImportIssue[];
} {
  const { issues, add } = collectIssues(sheet.name);
  const headers = TABLE_HEADERS.constraints;
  const rows = readTable(sheet, headers, ['kind', 'content'], add);

  const constraints = rows.flatMap((row): DraftConstraint[] => {
    const field = fieldReader(row, headers, add);
    const kind = field.option('kind', CONSTRAINT_KIND_LABELS);
    if (kind === null) field.error('required', 'kind');
    if (kind === undefined)
      field.error('invalidOption', 'kind', { value: cellText(row.value('kind')) });

    const constraint = {
      key: rowKey(sheet, row.row),
      kind,
      subject: field.text('subject', 50),
      content: field.requiredText('content', 1000),
    };
    return field.ok() && kind ? [{ ...constraint, kind }] : [];
  });
  return { constraints, issues };
}
