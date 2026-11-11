import { describe, expect, it } from 'vitest';
import { pairAddresses } from '@/lib/maps/address';

const ja = (entries: [string, string][]) => ({ language: 'ja', addresses: new Map(entries) });
const zh = (entries: [string, string][]) => ({ language: 'zh-TW', addresses: new Map(entries) });

describe('pairAddresses', () => {
  it('當地語言為主，繁中可以切換', () => {
    expect(
      pairAddresses(['a'], ja([['a', '宮城県仙台市']]), zh([['a', 'Sendai, Miyagi']])),
    ).toEqual({
      a: {
        primary: { text: '宮城県仙台市', language: 'ja' },
        alternate: { text: 'Sendai, Miyagi', language: 'zh-TW' },
      },
    });
  });

  it('兩種語言相同，或沒有另一種語言時不提供切換', () => {
    expect(pairAddresses(['a'], ja([['a', '同じ']]), zh([['a', '同じ']]))).toEqual({
      a: { primary: { text: '同じ', language: 'ja' }, alternate: null },
    });
    expect(pairAddresses(['a'], zh([['a', '台北市']]), null)).toEqual({
      a: { primary: { text: '台北市', language: 'zh-TW' }, alternate: null },
    });
  });

  it('主要語言查不到時改用另一種；都查不到的略過', () => {
    expect(pairAddresses(['a', 'b'], ja([]), zh([['a', 'Sendai']]))).toEqual({
      a: { primary: { text: 'Sendai', language: 'zh-TW' }, alternate: null },
    });
  });
});
