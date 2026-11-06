import type { ItemCategory } from '@/lib/trip/enums';
import { timeSlotForTime, type TimeSlot } from '@/lib/trip/time-slot';
import { toHalfWidth } from './cells';
import { reverseLookup, TIME_SLOT_LABELS } from './vocabulary';

// 每日行程工作表的「時段」與「內容」欄怎麼解讀（ADR 0008）。

// ---------------------------------------------------------------------------
// 時段欄
// ---------------------------------------------------------------------------

export type TimeCell = {
  timeSlot: TimeSlot;
  startTime: string | null;
  endTime: string | null;
  // 同義詞順便決定的類別，例如「晚餐」是餐食。
  category: ItemCategory | null;
  // false：空白或認不出來，歸到「整天」。
  recognized: boolean;
  // 結束時間不晚於開始時間（跨午夜不支援），所以只保留開始時間。
  endTimeDropped: boolean;
};

const SYNONYMS: Record<string, { timeSlot: TimeSlot; category?: ItemCategory }> = {
  全天: { timeSlot: 'all_day' },
  整日: { timeSlot: 'all_day' },
  早上: { timeSlot: 'morning' },
  夜晚: { timeSlot: 'night' },
  夜間: { timeSlot: 'night' },
  晚間: { timeSlot: 'night' },
  早餐: { timeSlot: 'early_morning', category: 'meal' },
  午餐: { timeSlot: 'noon', category: 'meal' },
  晚餐: { timeSlot: 'night', category: 'meal' },
  住宿: { timeSlot: 'night', category: 'lodging' },
  提醒: { timeSlot: 'all_day', category: 'reminder' },
};

// 「17:00」「約17:00」「17:00左右」「13:30–14:00」
const TIME_RANGE =
  /^(?:大約|約)?(\d{1,2}):(\d{2})(?:[-–—~至到](\d{1,2}):(\d{2}))?(?:左右|前後|起)?$/;

function toTime(hours: string, minutes: string): string | null {
  const h = Number(hours);
  const m = Number(minutes);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${minutes}`;
}

const UNRECOGNIZED: TimeCell = {
  timeSlot: 'all_day',
  startTime: null,
  endTime: null,
  category: null,
  recognized: false,
  endTimeDropped: false,
};

function matchTimeCell(text: string): TimeCell | null {
  const slot = reverseLookup(TIME_SLOT_LABELS, text);
  if (slot) return { ...UNRECOGNIZED, timeSlot: slot, recognized: true };

  const synonym = SYNONYMS[text];
  if (synonym) {
    return {
      ...UNRECOGNIZED,
      timeSlot: synonym.timeSlot,
      category: synonym.category ?? null,
      recognized: true,
    };
  }

  const match = TIME_RANGE.exec(text);
  if (!match) return null;
  const startTime = toTime(match[1], match[2]);
  if (!startTime) return null;
  const endTime = match[3] && match[4] ? toTime(match[3], match[4]) : null;
  const endTimeDropped = endTime !== null && endTime <= startTime;
  return {
    timeSlot: timeSlotForTime(startTime),
    startTime,
    endTime: endTimeDropped ? null : endTime,
    category: null,
    recognized: true,
    endTimeDropped,
  };
}

// 依序比對：時段名稱 → 同義詞 → 時間；「傍晚／晚上」這類寫法取第一個。
export function parseTimeCell(raw: string): TimeCell {
  const text = toHalfWidth(raw).replace(/\s+/g, '');
  if (!text) return UNRECOGNIZED;
  const direct = matchTimeCell(text);
  if (direct) return direct;
  const [first] = text.split(/[/、,，]/);
  return (first !== text && matchTimeCell(first)) || UNRECOGNIZED;
}

// ---------------------------------------------------------------------------
// 類別推測
// ---------------------------------------------------------------------------

// 依序比對，先符合的優先（例如「搭車前往餐廳」是交通）。
const CATEGORY_KEYWORDS: readonly (readonly [ItemCategory, readonly string[]])[] = [
  ['transport', ['新幹線', 'jr', '巴士', '搭', '前往', '機場', '接駁', '電車', '地鐵', '計程車']],
  ['meal', ['餐', '料理']],
  ['lodging', ['入住', '退房', 'check-in', 'check in', 'checkin', 'check-out', 'checkout']],
  ['shopping', ['購物', '逛街', '伴手禮', '採買']],
];

function matchKeywords(text: string): ItemCategory | null {
  const lower = text.toLowerCase();
  const found = CATEGORY_KEYWORDS.find(([, words]) => words.some((word) => lower.includes(word)));
  return found ? found[0] : null;
}

// 先看標題，標題沒有線索再看說明；都沒有時回傳 null（由呼叫端用「景點」）。
export function inferCategory(title: string, description: string | null): ItemCategory | null {
  return matchKeywords(title) ?? (description ? matchKeywords(description) : null);
}

// ---------------------------------------------------------------------------
// 內容欄
// ---------------------------------------------------------------------------

export const TITLE_MAX_LENGTH = 200;

export type ContentCell = { title: string; description: string | null; truncated: boolean };

// 第一行是標題（去掉結尾的標點），其餘各行是說明；標題太長時截斷，全文放進說明。
export function splitContent(raw: string): ContentCell | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0].replace(/[；;，,、。]+$/, '').trim() || lines[0];
  const description = lines.slice(1).join('\n') || null;
  // 與資料庫的 char_length 一致，用 code point 計算長度。
  const chars = Array.from(firstLine);
  if (chars.length <= TITLE_MAX_LENGTH) return { title: firstLine, description, truncated: false };
  return {
    title: chars.slice(0, TITLE_MAX_LENGTH).join(''),
    description: lines.join('\n'),
    truncated: true,
  };
}

// 備案比對用：忽略前後空白、連續空白、全形半形與結尾標點的差異。
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[；;，,、。]+$/, '')
    .trim();
}
