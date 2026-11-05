import { formString } from '@/lib/form';

// 項目表單的欄位名稱。地點與備案是可以增減的多列，同名欄位依畫面順序送出。
export const ITEM_FIELDS = {
  dayId: 'dayId',
  title: 'title',
  timeSlot: 'timeSlot',
  category: 'category',
  startTime: 'startTime',
  endTime: 'endTime',
  description: 'description',
  url: 'url',
  place: 'place',
  fallbackCondition: 'fallbackCondition',
  fallbackAlternative: 'fallbackAlternative',
} as const;

function formStrings(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((value) => (typeof value === 'string' ? value : ''));
}

// FormData → itemSchema 的輸入。不在這裡丟掉空白的列：
// 錯誤要用列的索引（places.1.name）對回畫面上的同一列。
export function parseItemFormData(formData: FormData) {
  const conditions = formStrings(formData, ITEM_FIELDS.fallbackCondition);
  const alternatives = formStrings(formData, ITEM_FIELDS.fallbackAlternative);

  return {
    dayId: formString(formData, ITEM_FIELDS.dayId),
    title: formString(formData, ITEM_FIELDS.title),
    timeSlot: formString(formData, ITEM_FIELDS.timeSlot),
    category: formString(formData, ITEM_FIELDS.category),
    startTime: formString(formData, ITEM_FIELDS.startTime),
    endTime: formString(formData, ITEM_FIELDS.endTime),
    description: formString(formData, ITEM_FIELDS.description),
    url: formString(formData, ITEM_FIELDS.url),
    places: formStrings(formData, ITEM_FIELDS.place).map((name) => ({ name })),
    fallbacks: alternatives.map((alternative, index) => ({
      condition: conditions[index] ?? '',
      alternative,
    })),
  };
}
