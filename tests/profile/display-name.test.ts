import { describe, expect, it } from 'vitest';
import { cleanDisplayName, nameInitial } from '@/lib/profile/display-name';

describe('cleanDisplayName', () => {
  it.each([
    ['  小林  ', '小林'],
    ['Gary Lin', 'Gary Lin'],
    ['   ', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%j → %j', (name, expected) => {
    expect(cleanDisplayName(name)).toBe(expected);
  });
});

describe('nameInitial', () => {
  it.each([
    ['小林', '小'],
    ['gary', 'G'],
    [' amy', 'A'],
    ['👨‍👩‍👧 一家人', '👨‍👩‍👧'],
    ['   ', null],
    [null, null],
  ])('%j → %j', (name, expected) => {
    expect(nameInitial(name)).toBe(expected);
  });
});
