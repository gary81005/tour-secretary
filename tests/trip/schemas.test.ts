import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  dayUpdateSchema,
  itemSchema,
  staySchema,
  tripCreateSchema,
  type ValidationErrorKey,
} from '@/lib/trip/schemas';

// 取出 { 欄位: 錯誤 key }，方便斷言。
function errorsOf(result: z.ZodSafeParseResult<unknown>): Record<string, ValidationErrorKey> {
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message as ValidationErrorKey]),
  );
}

const DAY_ID = '8f14e45f-ceea-4e6a-9c7a-1b2c3d4e5f60';

describe('tripCreateSchema', () => {
  const valid = {
    name: ' 東北秘境探險 ',
    startDate: '2027-03-05',
    endDate: '2027-03-14',
    timezone: 'Asia/Tokyo',
  };

  it('合法資料會 trim 名稱', () => {
    const result = tripCreateSchema.safeParse(valid);
    expect(result.success && result.data.name).toBe('東北秘境探險');
  });

  it('名稱必填、結束日不能早於開始日', () => {
    expect(errorsOf(tripCreateSchema.safeParse({ ...valid, name: '  ' }))).toEqual({
      name: 'required',
    });
    expect(errorsOf(tripCreateSchema.safeParse({ ...valid, endDate: '2027-03-04' }))).toEqual({
      endDate: 'endBeforeStart',
    });
  });

  it('最多 60 天', () => {
    expect(tripCreateSchema.safeParse({ ...valid, endDate: '2027-05-03' }).success).toBe(true);
    expect(errorsOf(tripCreateSchema.safeParse({ ...valid, endDate: '2027-05-04' }))).toEqual({
      endDate: 'tripTooLong',
    });
  });

  it('無效的時區與日期', () => {
    expect(errorsOf(tripCreateSchema.safeParse({ ...valid, timezone: 'Mars/Base' }))).toEqual({
      timezone: 'invalidTimezone',
    });
    expect(
      errorsOf(tripCreateSchema.safeParse({ ...valid, startDate: '2027-02-30' })),
    ).toHaveProperty('startDate', 'invalidDate');
  });
});

describe('itemSchema', () => {
  const valid = {
    dayId: DAY_ID,
    title: '淺草寺、仲見世通',
    timeSlot: 'morning',
    category: 'sightseeing',
    startTime: '',
    endTime: '',
    description: '',
    url: '',
    places: [{ name: '淺草寺' }, { name: '仲見世通' }],
    fallbacks: [{ condition: '', alternative: '改去上野' }],
  };

  it('空字串轉成 null', () => {
    const result = itemSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      startTime: null,
      endTime: null,
      description: null,
      url: null,
      fallbacks: [{ condition: null, alternative: '改去上野' }],
    });
  });

  it('時間格式是 HH:MM', () => {
    expect(itemSchema.safeParse({ ...valid, startTime: '09:30' }).success).toBe(true);
    expect(errorsOf(itemSchema.safeParse({ ...valid, startTime: '9點' }))).toEqual({
      startTime: 'invalidTime',
    });
  });

  it('有結束時間就要有開始時間，且要晚於開始時間', () => {
    expect(errorsOf(itemSchema.safeParse({ ...valid, endTime: '10:00' }))).toEqual({
      endTime: 'endTimeWithoutStart',
    });
    expect(
      errorsOf(itemSchema.safeParse({ ...valid, startTime: '10:00', endTime: '10:00' })),
    ).toEqual({
      endTime: 'endTimeNotAfterStart',
    });
  });

  it('連結只接受 http(s)', () => {
    expect(itemSchema.safeParse({ ...valid, url: 'https://example.com/booking' }).success).toBe(
      true,
    );
    expect(errorsOf(itemSchema.safeParse({ ...valid, url: 'javascript:alert(1)' }))).toEqual({
      url: 'invalidUrl',
    });
  });

  it('時段與類別必須是 enum 值', () => {
    expect(errorsOf(itemSchema.safeParse({ ...valid, timeSlot: 'lunch', category: 'x' }))).toEqual({
      timeSlot: 'invalidOption',
      category: 'invalidOption',
    });
  });

  it('地點名稱必填', () => {
    expect(errorsOf(itemSchema.safeParse({ ...valid, places: [{ name: ' ' }] }))).toEqual({
      'places.0.name': 'required',
    });
  });
});

describe('staySchema', () => {
  it('退房要晚於入住', () => {
    const result = staySchema.safeParse({
      name: '藏王溫泉旅館',
      checkIn: '2027-03-08',
      checkOut: '2027-03-08',
      status: 'candidate',
    });
    expect(errorsOf(result)).toEqual({ checkOut: 'checkOutNotAfterCheckIn' });
  });

  const stay = {
    name: '藏王溫泉旅館',
    checkIn: '2027-03-08',
    checkOut: '2027-03-09',
    status: 'booked',
  };

  it('連結的地點：空白表示沒有連結，格式不對的 session token 當作沒有', () => {
    const linked = staySchema.safeParse({
      ...stay,
      placeId: 'ChIJ_abc-1',
      sessionToken: 'bad token!',
    });
    expect(linked.success && linked.data).toMatchObject({
      placeId: 'ChIJ_abc-1',
      sessionToken: null,
    });

    const unlinked = staySchema.safeParse({ ...stay, placeId: '', sessionToken: '' });
    expect(unlinked.success && unlinked.data).toMatchObject({ placeId: null, sessionToken: null });
  });

  it('地點 ID 格式不對時擋下', () => {
    const result = staySchema.safeParse({ ...stay, placeId: '../x' });
    expect(errorsOf(result)).toEqual({ placeId: 'invalidOption' });
  });
});

describe('dayUpdateSchema', () => {
  it('時區留空表示沿用行程預設', () => {
    const result = dayUpdateSchema.safeParse({ city: '仙台', timezone: '' });
    expect(result.success && result.data).toEqual({ city: '仙台', timezone: null });
  });
});
