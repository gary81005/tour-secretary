import { describe, expect, it } from 'vitest';
import { isInvitePath, isPublicPath, safeNextPath, stripLocale } from '@/lib/auth/paths';

describe('stripLocale', () => {
  it('去掉語系前綴', () => {
    expect(stripLocale('/zh-TW/login')).toBe('/login');
    expect(stripLocale('/zh-TW')).toBe('/');
    expect(stripLocale('/trips/abc')).toBe('/trips/abc');
    expect(stripLocale('/')).toBe('/');
  });
});

describe('isPublicPath', () => {
  it.each(['/login', '/zh-TW/login', '/auth/callback', '/auth/confirm', '/offline'])(
    '%s 不用登入',
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

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

describe('isInvitePath', () => {
  it('邀請連結', () => {
    expect(isInvitePath(safeNextPath('/invite/0b8f3c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'))).toBe(true);
  });

  it.each(['/', '/trips/abc', '/invite', '/invites/abc'])('%s 不是邀請連結', (path) => {
    expect(isInvitePath(path)).toBe(false);
  });
});
