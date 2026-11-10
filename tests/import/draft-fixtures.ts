import type { ExistingTrip } from '@/lib/import/plan';
import type { DraftFallback, DraftItem, DraftStay, ImportDraft } from '@/lib/import/types';

export function draftItem(key: string, date: string, title: string): DraftItem {
  return {
    key,
    date,
    row: 2,
    timeSlot: 'morning',
    startTime: null,
    endTime: null,
    category: 'sightseeing',
    categorySource: 'default',
    timeSlotGuessed: false,
    title,
    description: null,
  };
}

export function draftStay(key: string, name: string, checkIn: string, checkOut: string): DraftStay {
  return {
    key,
    name,
    checkIn,
    checkOut,
    address: null,
    status: 'candidate',
    confirmationCode: null,
    url: null,
    note: null,
  };
}

export function draftFallback(key: string, date: string, itemTitle: string): DraftFallback {
  return { key, date, itemTitle, condition: null, alternative: '改逛溫泉街' };
}

export function draft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  return {
    scheduleSheet: '行程',
    days: [],
    items: [],
    stays: null,
    notes: null,
    fallbacks: null,
    constraints: null,
    issues: [],
    ...overrides,
  };
}

// 3/5–3/7 的既有行程：3/5 東京、3/6 沒有城市、3/7 仙台。
export function existingTrip(overrides: Partial<ExistingTrip> = {}): ExistingTrip {
  return {
    startDate: '2027-03-05',
    endDate: '2027-03-07',
    days: [
      { date: '2027-03-05', city: '東京' },
      { date: '2027-03-06', city: null },
      { date: '2027-03-07', city: '仙台' },
    ],
    items: [
      { id: 'i1', date: '2027-03-05', title: '淺草寺' },
      { id: 'i2', date: '2027-03-06', title: '晴空塔' },
    ],
    stays: [{ name: '東京飯店', checkIn: '2027-03-05', checkOut: '2027-03-07' }],
    notes: [{ topic: '行李' }],
    constraints: [{ kind: 'diet', content: '不吃牛肉' }],
    ...overrides,
  };
}
