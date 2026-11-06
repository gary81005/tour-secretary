import type { ItemCategory, StayStatus, TravelerConstraintKind } from '@/lib/trip/enums';
import type { TimeSlot } from '@/lib/trip/time-slot';

// ---------------------------------------------------------------------------
// 讀進來的工作表：與 exceljs 無關的純資料，解析邏輯只依賴這個型別，方便測試。
// ---------------------------------------------------------------------------

export type Hyperlink = { text: string; hyperlink: string };

// 日期值是 UTC 午夜的 Date；只有時間的儲存格是 1899-12-30 當天的 Date。
export type CellValue = string | number | boolean | Date | Hyperlink | null;

// 從 0 起算、含頭尾。
export type CellRange = { top: number; left: number; bottom: number; right: number };

export type SheetData = {
  name: string;
  // 合併儲存格只有左上角有值，其他位置是 null。
  rows: CellValue[][];
  merges: CellRange[];
};

// ---------------------------------------------------------------------------
// 解析結果
// ---------------------------------------------------------------------------

export type ImportIssueCode =
  // 錯誤：擋住匯入
  | 'noDates'
  | 'invalidDate'
  | 'duplicateDate'
  | 'datesNotAscending'
  | 'tooManyDays'
  | 'missingColumn'
  | 'required'
  | 'tooLong'
  | 'invalidOption'
  | 'checkOutNotAfterCheckIn'
  // 警告：可以在預覽處理，或直接匯入
  | 'timeSlotUnrecognized'
  | 'endTimeDropped'
  | 'emptyContent'
  | 'titleTruncated'
  | 'invalidUrl'
  | 'unknownStatus'
  | 'rowsIgnored';

export type ImportIssue = {
  severity: 'error' | 'warning';
  code: ImportIssueCode;
  sheet: string;
  // 例如 'B3'；整張工作表的問題是 null。
  cell: string | null;
  params?: Record<string, string | number>;
};

export type DraftDay = {
  date: string;
  city: string | null;
};

// 類別怎麼來的：時段欄的同義詞（例如「晚餐」）、關鍵字推測，或預設的「景點」。
export type CategorySource = 'timeCell' | 'keyword' | 'default';

export type DraftItem = {
  // 「工作表!內容儲存格」，在預覽中識別這一列。
  key: string;
  date: string;
  // 在試算表中的列（從 0 起算），同一天同一時段依列的順序排列。
  row: number;
  timeSlot: TimeSlot;
  // 'HH:MM'
  startTime: string | null;
  endTime: string | null;
  category: ItemCategory;
  categorySource: CategorySource;
  // 時段欄認不出來、歸到「整天」的項目。
  timeSlotGuessed: boolean;
  title: string;
  description: string | null;
};

export type DraftStay = {
  key: string;
  name: string;
  checkIn: string;
  checkOut: string;
  address: string | null;
  status: StayStatus;
  confirmationCode: string | null;
  url: string | null;
  note: string | null;
};

export type DraftNote = { key: string; topic: string; content: string | null };

export type DraftConstraint = {
  key: string;
  kind: TravelerConstraintKind;
  subject: string | null;
  content: string;
};

export type DraftFallback = {
  key: string;
  // 日期與項目標題用來找出要掛的項目（matchFallbacks）。
  date: string;
  itemTitle: string;
  condition: string | null;
  alternative: string;
};

export type ImportDraft = {
  // 沒有每日行程的工作表時是 null（例如只上傳「備案」）。
  scheduleSheet: string | null;
  days: DraftDay[];
  items: DraftItem[];
  // null 表示檔案沒有這張工作表；覆蓋模式只替換檔案有的工作表。
  stays: DraftStay[] | null;
  notes: DraftNote[] | null;
  fallbacks: DraftFallback[] | null;
  constraints: DraftConstraint[] | null;
  issues: ImportIssue[];
};
