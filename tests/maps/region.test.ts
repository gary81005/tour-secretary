import { describe, expect, it } from 'vitest';
import { regionCodeForTimezone, routesSupported } from '@/lib/maps/region';
import { COMMON_TIMEZONES } from '@/lib/trip/timezones';

describe('regionCodeForTimezone', () => {
  it('時區選單的常用時區都有對應的國家', () => {
    COMMON_TIMEZONES.forEach((timezone) => {
      expect(regionCodeForTimezone(timezone)).toMatch(/^[A-Z]{2}$/);
    });
  });

  it('不在表上的時區不帶 regionCode', () => {
    expect(regionCodeForTimezone('Europe/Paris')).toBeNull();
  });
});

describe('routesSupported', () => {
  it('韓國不算移動時間', () => {
    expect(routesSupported('Asia/Seoul')).toBe(false);
    expect(routesSupported('Asia/Tokyo')).toBe(true);
    expect(routesSupported('Europe/Paris')).toBe(true);
  });
});
