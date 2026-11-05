import { describe, expect, it } from 'vitest';
import { timeSlotForTime, toHourMinute } from '@/lib/trip/time-slot';

describe('timeSlotForTime', () => {
  it.each([
    ['05:00', 'early_morning'],
    ['07:59', 'early_morning'],
    ['08:00', 'morning'],
    ['10:59', 'morning'],
    ['11:00', 'noon'],
    ['13:30', 'noon'],
    ['14:00', 'afternoon'],
    ['17:00', 'evening'],
    ['18:59', 'evening'],
    ['19:00', 'night'],
    ['23:59', 'night'],
  ])('%s → %s', (time, slot) => {
    expect(timeSlotForTime(time)).toBe(slot);
  });

  it('不支援跨午夜：凌晨歸到清晨', () => {
    expect(timeSlotForTime('00:30')).toBe('early_morning');
    expect(timeSlotForTime('04:59')).toBe('early_morning');
  });

  it('接受 Postgres 回傳的 HH:MM:SS', () => {
    expect(timeSlotForTime('17:00:00')).toBe('evening');
    expect(toHourMinute('09:05:00')).toBe('09:05');
  });
});
