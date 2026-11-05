import { describe, expect, it } from 'vitest';
import { isPublicPath, safeNextPath, stripLocale } from '@/lib/auth/paths';

describe('stripLocale', () => {
  it('去掉語系前綴', () => {
    expect(stripLocale('/zh-TW/login')).toBe('/login');
    expect(stripLocale('/zh-TW')).toBe('/');
    expect(stripLocale('/trips/abc')).toBe('/trips/abc');
    expect(stripLocale('/')).toBe('/');
  });
});

describe('isPublicPath', () => {
  it.each(['/login', '/zh-TW/login', '/auth/callback', '/auth/confirm'])('%s 不用登入', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(['/', '/trips', '/trips/abc', '/login-help', '/authors'])('%s 要登入', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('保留站內路徑與查詢字串', () => {
    expect(safeNextPath('/trips/abc?day=3')).toBe('/trips/abc?day=3');
    expect(safeNextPath('/trips#top')).toBe('/trips#top');
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['trips'],
    ['https://evil.com'],
    ['//evil.com'],
    ['/\\evil.com'],
    ['/\t/evil.com'],
    ['javascript:alert(1)'],
  ])('外部或無效的 %j 一律回首頁', (next) => {
    expect(safeNextPath(next)).toBe('/');
  });

  it('不會導回登入相關頁面', () => {
    expect(safeNextPath('/login')).toBe('/');
    expect(safeNextPath('/auth/callback?code=x')).toBe('/');
  });
});
