import { describe, expect, it } from 'vitest';
import { isSafeHttpUrl } from '@/lib/url';

describe('isSafeHttpUrl', () => {
  it.each(['https://example.com/booking?id=1', 'http://localhost:3000', 'HTTPS://EXAMPLE.COM'])(
    '%s 可以顯示成連結',
    (url) => {
      expect(isSafeHttpUrl(url)).toBe(true);
    },
  );

  it.each([
    null,
    undefined,
    '',
    'javascript:alert(1)',
    ' javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'example.com',
    '//evil.com',
  ])('%j 不顯示成連結', (url) => {
    expect(isSafeHttpUrl(url)).toBe(false);
  });
});
