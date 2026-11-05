import { describe, expect, it } from 'vitest';
import { ITEM_FIELDS, parseItemFormData } from '@/lib/trip/item-form';
import { itemSchema } from '@/lib/trip/schemas';

const DAY_ID = '8f14e45f-ceea-4e6a-9c7a-1b2c3d4e5f60';

function formData(entries: [string, string][]) {
  const data = new FormData();
  entries.forEach(([key, value]) => data.append(key, value));
  return data;
}

describe('parseItemFormData', () => {
  it('多列的地點與備案依順序組回陣列，並通過 itemSchema', () => {
    const parsed = parseItemFormData(
      formData([
        [ITEM_FIELDS.dayId, DAY_ID],
        [ITEM_FIELDS.title, '藏王纜車／樹冰'],
        [ITEM_FIELDS.timeSlot, 'morning'],
        [ITEM_FIELDS.category, 'sightseeing'],
        [ITEM_FIELDS.startTime, '09:00'],
        [ITEM_FIELDS.endTime, ''],
        [ITEM_FIELDS.place, '藏王纜車'],
        [ITEM_FIELDS.place, '樹冰'],
        [ITEM_FIELDS.fallbackCondition, '纜車停駛'],
        [ITEM_FIELDS.fallbackAlternative, '改逛溫泉街'],
        [ITEM_FIELDS.fallbackCondition, ''],
        [ITEM_FIELDS.fallbackAlternative, '回旅館泡湯'],
      ]),
    );

    expect(parsed.places).toEqual([{ name: '藏王纜車' }, { name: '樹冰' }]);
    expect(parsed.fallbacks).toEqual([
      { condition: '纜車停駛', alternative: '改逛溫泉街' },
      { condition: '', alternative: '回旅館泡湯' },
    ]);

    const result = itemSchema.safeParse(parsed);
    expect(result.success && result.data).toMatchObject({
      startTime: '09:00',
      endTime: null,
      description: null,
      url: null,
      fallbacks: [
        { condition: '纜車停駛', alternative: '改逛溫泉街' },
        { condition: null, alternative: '回旅館泡湯' },
      ],
    });
  });

  it('空白的列保留下來，錯誤索引才能對回畫面上的同一列', () => {
    const parsed = parseItemFormData(
      formData([
        [ITEM_FIELDS.place, '淺草寺'],
        [ITEM_FIELDS.place, '  '],
      ]),
    );
    expect(parsed.places).toEqual([{ name: '淺草寺' }, { name: '  ' }]);
    expect(parsed.fallbacks).toEqual([]);
  });

  it('沒有送出的欄位是空字串', () => {
    expect(parseItemFormData(new FormData())).toMatchObject({
      title: '',
      timeSlot: '',
      places: [],
      fallbacks: [],
    });
  });
});
