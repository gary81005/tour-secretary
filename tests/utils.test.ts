import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('後面的 Tailwind class 覆蓋前面衝突的 class', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });

  it('忽略 falsy 值', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});
