import { describe, expect, it } from 'vitest';
import { hoursOnDate, hoursStatus } from '@/lib/maps/opening-hours';
import type { HoursPoint, OpeningHours, PlaceDetails } from '@/lib/maps/types';

// 2027-04-12 是星期一。
const today = '2027-04-12';

const at = (day: number, time: string, date: string | null = null): HoursPoint => {
  const [hour, minute] = time.split(':').map(Number);
  return { day, hour, minute, date };
};

// 星期一到六 09:00–17:00，星期日公休。
const weekdays: OpeningHours = {
  periods: [1, 2, 3, 4, 5, 6].map((day) => ({ open: at(day, '09:00'), close: at(day, '17:00') })),
};

const details = (overrides: Partial<PlaceDetails> = {}) => ({
  businessStatus: 'operational' as const,
  regularHours: weekdays,
  currentHours: null,
  ...overrides,
});

describe('hoursOnDate：一般營業時間', () => {
  it('依星期取當天的營業時間', () => {
    expect(hoursOnDate(details(), '2027-04-20', today)).toEqual({
      source: 'regular',
      ranges: [{ start: 540, end: 1020, fromPreviousDay: false }],
    });
  });

  it('沒有營業的星期是公休', () => {
    expect(hoursOnDate(details(), '2027-04-25', today)?.ranges).toEqual([]);
  });

  it('營業到隔天凌晨：當天的範圍超過 24:00，隔天凌晨算在隔天', () => {
    const bar = { periods: [{ open: at(5, '18:00'), close: at(6, '02:00') }] };
    // 2027-04-23 星期五、04-24 星期六
    expect(hoursOnDate(details({ regularHours: bar }), '2027-04-23', today)?.ranges).toEqual([
      { start: 1080, end: 1560, fromPreviousDay: false },
    ]);
    expect(hoursOnDate(details({ regularHours: bar }), '2027-04-24', today)?.ranges).toEqual([
      { start: 0, end: 120, fromPreviousDay: true },
    ]);
  });

  it('星期六開到星期日凌晨（跨週）', () => {
    const bar = { periods: [{ open: at(6, '22:00'), close: at(0, '03:00') }] };
    expect(hoursOnDate(details({ regularHours: bar }), '2027-04-25', today)?.ranges).toEqual([
      { start: 0, end: 180, fromPreviousDay: true },
    ]);
  });

  it('24 小時營業', () => {
    const always = { periods: [{ open: at(0, '00:00'), close: null }] };
    expect(hoursOnDate(details({ regularHours: always }), '2027-04-25', today)?.ranges).toEqual([
      { start: 0, end: 1440, fromPreviousDay: false },
    ]);
  });

  it('沒有營業時間資料', () => {
    expect(hoursOnDate(details({ regularHours: null }), '2027-04-20', today)).toBeNull();
  });
});

describe('hoursOnDate：7 天內用 currentOpeningHours', () => {
  // 星期三（04-14）臨時公休，星期四（04-15）提早到 15:00。
  const current: OpeningHours = {
    periods: [
      { open: at(1, '09:00', '2027-04-12'), close: at(1, '17:00', '2027-04-12') },
      { open: at(2, '09:00', '2027-04-13'), close: at(2, '17:00', '2027-04-13') },
      { open: at(4, '09:00', '2027-04-15'), close: at(4, '15:00', '2027-04-15') },
    ],
  };

  it('特殊營業日以 currentOpeningHours 為準', () => {
    const place = details({ currentHours: current });
    expect(hoursOnDate(place, '2027-04-14', today)).toEqual({ source: 'current', ranges: [] });
    expect(hoursOnDate(place, '2027-04-15', today)?.ranges).toEqual([
      { start: 540, end: 900, fromPreviousDay: false },
    ]);
  });

  it('超過 7 天或已經過去的日期用一般營業時間', () => {
    const place = details({ currentHours: current });
    expect(hoursOnDate(place, '2027-04-19', today)?.source).toBe('regular');
    expect(hoursOnDate(place, '2027-04-11', today)?.source).toBe('regular');
  });

  it('24 小時營業：Google 回傳一段涵蓋整個 7 天的時間', () => {
    const always: OpeningHours = {
      periods: [{ open: at(1, '00:00', '2027-04-12'), close: at(0, '23:59', '2027-04-18') }],
    };
    const place = details({ currentHours: always });
    expect(hoursOnDate(place, '2027-04-14', today)?.ranges).toEqual([
      { start: 0, end: 1440, fromPreviousDay: true },
    ]);
  });
});

describe('hoursStatus', () => {
  const item = (date: string, start_time: string | null = null) => ({ date, start_time });

  it('歇業優先於營業時間', () => {
    expect(
      hoursStatus(details({ businessStatus: 'closedPermanently' }), item('2027-04-20'), today),
    ).toBe('closedPermanently');
    expect(
      hoursStatus(details({ businessStatus: 'closedTemporarily' }), item('2027-04-20'), today),
    ).toBe('closedTemporarily');
  });

  it('當天公休', () => {
    expect(hoursStatus(details(), item('2027-04-25'), today)).toBe('closedThatDay');
  });

  it('有精確時間時，開始時間不在營業時間內是「可能未營業」', () => {
    expect(hoursStatus(details(), item('2027-04-20', '08:30:00'), today)).toBe('maybeClosed');
    expect(hoursStatus(details(), item('2027-04-20', '17:00:00'), today)).toBe('maybeClosed');
    expect(hoursStatus(details(), item('2027-04-20', '09:00:00'), today)).toBeNull();
  });

  it('沒有精確時間或沒有營業時間資料時不標記', () => {
    expect(hoursStatus(details(), item('2027-04-20'), today)).toBeNull();
    expect(
      hoursStatus(details({ regularHours: null }), item('2027-04-20', '03:00:00'), today),
    ).toBeNull();
  });

  it('凌晨的項目算進前一天延續過來的營業時間', () => {
    const bar = { periods: [{ open: at(5, '18:00'), close: at(6, '02:00') }] };
    expect(
      hoursStatus(details({ regularHours: bar }), item('2027-04-24', '01:00:00'), today),
    ).toBeNull();
  });
});
