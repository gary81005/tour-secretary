import type { ItemCategory, StayStatus, TravelerConstraintKind } from '@/lib/trip/enums';
import type { TimeSlot } from '@/lib/trip/time-slot';

// xlsx 範本的格式用語（ADR 0008）。範本是 zh-TW 的檔案格式，解析與產生範本都以這裡為準；
// 選項名稱與 messages/zh-TW 的畫面用語相同，由測試確認兩邊沒有脫節。

export const SHEET_NAMES = {
  schedule: '行程',
  stays: '住宿',
  notes: '提醒事項',
  fallbacks: '備案',
  constraints: '旅伴限制',
  instructions: '說明',
} as const;

// 這些名稱的工作表不會被當成每日行程（第一張）。
export const NON_SCHEDULE_SHEET_NAMES: readonly string[] = [
  SHEET_NAMES.stays,
  SHEET_NAMES.notes,
  SHEET_NAMES.fallbacks,
  SHEET_NAMES.constraints,
  SHEET_NAMES.instructions,
];

export const TIME_SLOT_LABELS = {
  all_day: '整天',
  early_morning: '清晨',
  morning: '上午',
  noon: '中午',
  afternoon: '下午',
  evening: '傍晚',
  night: '晚上',
} as const satisfies Record<TimeSlot, string>;

export const CATEGORY_LABELS = {
  sightseeing: '景點',
  meal: '餐食',
  transport: '交通',
  lodging: '住宿',
  shopping: '購物',
  reminder: '提醒',
} as const satisfies Record<ItemCategory, string>;

export const STAY_STATUS_LABELS = {
  candidate: '候選',
  booked: '已預訂',
  paid: '已付款',
} as const satisfies Record<StayStatus, string>;

export const CONSTRAINT_KIND_LABELS = {
  diet: '飲食',
  stamina: '體力',
  mobility: '行動',
  preference: '偏好',
  other: '其他',
} as const satisfies Record<TravelerConstraintKind, string>;

// 結構化工作表的欄位：第 1 列是標題列，依標題文字找欄位，所以欄位順序可以調換。
// 範本會在必填欄位的標題後面加「*」，解析時忽略。
export const TABLE_HEADERS = {
  stays: {
    name: '名稱',
    checkIn: '入住日',
    checkOut: '退房日',
    address: '地址',
    status: '狀態',
    confirmationCode: '確認碼',
    url: '連結',
    note: '備註',
  },
  notes: { topic: '主題', content: '內容' },
  fallbacks: { date: '日期', itemTitle: '項目標題', condition: '條件', alternative: '替代方案' },
  constraints: { kind: '類型', subject: '對象', content: '內容' },
} as const;

export function reverseLookup<K extends string>(
  labels: Record<K, string>,
  text: string,
): K | undefined {
  return (Object.keys(labels) as K[]).find((key) => labels[key] === text);
}
