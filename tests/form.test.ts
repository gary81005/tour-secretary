import { describe, expect, it } from 'vitest';
import { fieldErrorsOf, formString } from '@/lib/form';
import { itemSchema, tripCreateSchema } from '@/lib/trip/schemas';

describe('fieldErrorsOf', () => {
  it('依欄位路徑取第一個錯誤', () => {
    const result = tripCreateSchema.safeParse({
      name: '',
      startDate: 'x',
      endDate: '',
      timezone: '',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsOf(result.error)).toEqual({
      name: 'required',
      startDate: 'invalidDate',
      endDate: 'invalidDate',
      timezone: 'invalidTimezone',
    });
  });

  it('巢狀欄位用點號串接', () => {
    const result = itemSchema.safeParse({
      dayId: '8f14e45f-ceea-4e6a-9c7a-1b2c3d4e5f60',
      title: 'x',
      timeSlot: 'morning',
      category: 'meal',
      places: [{ name: 'ok' }, { name: '' }],
      fallbacks: [],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsOf(result.error)).toEqual({ 'places.1.name': 'required' });
  });
});

describe('formString', () => {
  it('沒有值或是檔案時回傳空字串', () => {
    const formData = new FormData();
    formData.set('name', ' 東北 ');
    formData.set('file', new Blob(['x']));
    expect(formString(formData, 'name')).toBe(' 東北 ');
    expect(formString(formData, 'missing')).toBe('');
    expect(formString(formData, 'file')).toBe('');
  });
});
