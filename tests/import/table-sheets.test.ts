import { describe, expect, it } from 'vitest';
import {
  parseConstraintsSheet,
  parseFallbacksSheet,
  parseNotesSheet,
  parseStaysSheet,
} from '@/lib/import/table-sheets';
import { d, sheet } from './helpers';

const STAY_HEADERS = ['名稱*', '入住日*', '退房日*', '地址', '狀態', '確認碼', '連結', '備註'];

describe('parseStaysSheet', () => {
  it('讀取每一列，狀態空白是候選', () => {
    const s = sheet('住宿', [
      STAY_HEADERS,
      [
        'APA 仙台站五橋',
        d('2027-03-12'),
        d('2027-03-14'),
        '仙台市',
        '已預訂',
        'ABC123',
        'https://apa.co.jp',
        '含早餐',
      ],
      ['Oomya 旅館', '2027/3/9', '2027/3/10', null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
    ]);
    const { stays, issues } = parseStaysSheet(s);
    expect(issues).toEqual([]);
    expect(stays).toEqual([
      {
        key: '住宿!2',
        name: 'APA 仙台站五橋',
        checkIn: '2027-03-12',
        checkOut: '2027-03-14',
        address: '仙台市',
        status: 'booked',
        confirmationCode: 'ABC123',
        url: 'https://apa.co.jp',
        note: '含早餐',
      },
      expect.objectContaining({ key: '住宿!3', status: 'candidate', address: null, url: null }),
    ]);
  });

  it('依標題找欄位，順序可以調換', () => {
    const s = sheet('住宿', [
      ['退房日', '名稱', '入住日'],
      [d('2027-03-10'), 'Oomya', d('2027-03-09')],
    ]);
    expect(parseStaysSheet(s).stays[0]).toMatchObject({ name: 'Oomya', checkIn: '2027-03-09' });
  });

  it('缺少必填欄位時整張不讀', () => {
    const s = sheet('住宿', [
      ['名稱', '入住日'],
      ['Oomya', d('2027-03-09')],
    ]);
    const { stays, issues } = parseStaysSheet(s);
    expect(stays).toEqual([]);
    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'missingColumn',
        sheet: '住宿',
        cell: null,
        params: { column: '退房日' },
      },
    ]);
  });

  it('必填空白、日期錯誤、退房不晚於入住都擋下該列', () => {
    const s = sheet('住宿', [
      STAY_HEADERS,
      [null, d('2027-03-09'), d('2027-03-10')],
      ['A', '下週', d('2027-03-10')],
      ['B', d('2027-03-10'), d('2027-03-10')],
    ]);
    const { stays, issues } = parseStaysSheet(s);
    expect(stays).toEqual([]);
    expect(issues.map((issue) => [issue.code, issue.cell])).toEqual([
      ['required', 'A2'],
      ['invalidDate', 'B3'],
      ['checkOutNotAfterCheckIn', 'C4'],
    ]);
  });

  it('不合法的連結與狀態只提醒', () => {
    const s = sheet('住宿', [
      STAY_HEADERS,
      ['A', d('2027-03-09'), d('2027-03-10'), null, '考慮中', null, 'javascript:alert(1)'],
    ]);
    const { stays, issues } = parseStaysSheet(s);
    expect(stays[0]).toMatchObject({ status: 'candidate', url: null });
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([
      ['warning', 'unknownStatus'],
      ['warning', 'invalidUrl'],
    ]);
  });

  it('超過長度上限', () => {
    const s = sheet('住宿', [
      STAY_HEADERS,
      ['A', d('2027-03-09'), d('2027-03-10'), null, null, 'x'.repeat(101)],
    ]);
    expect(parseStaysSheet(s).issues).toEqual([
      {
        severity: 'error',
        code: 'tooLong',
        sheet: '住宿',
        cell: 'F2',
        params: { column: '確認碼', max: 100 },
      },
    ]);
  });
});

describe('parseNotesSheet', () => {
  it('主題必填、內容選填', () => {
    const s = sheet('提醒事項', [
      ['主題*', '內容'],
      ['交通方向', '3/5 東京進、3/14 仙台出'],
      ['行李', null],
      [null, '沒有主題'],
    ]);
    const { notes, issues } = parseNotesSheet(s);
    expect(notes).toEqual([
      { key: '提醒事項!2', topic: '交通方向', content: '3/5 東京進、3/14 仙台出' },
      { key: '提醒事項!3', topic: '行李', content: null },
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ code: 'required', cell: 'A4', params: { column: '主題' } }),
    ]);
  });
});

describe('parseFallbacksSheet', () => {
  it('讀取日期、項目標題、條件、替代方案', () => {
    const s = sheet('備案', [
      ['日期*', '項目標題*', '條件', '替代方案*'],
      [d('2027-03-09'), '藏王纜車／樹冰', '纜車停駛', '改逛藏王溫泉街'],
      [d('2027-03-09'), '藏王纜車／樹冰', null, null],
    ]);
    const { fallbacks, issues } = parseFallbacksSheet(s);
    expect(fallbacks).toEqual([
      {
        key: '備案!2',
        date: '2027-03-09',
        itemTitle: '藏王纜車／樹冰',
        condition: '纜車停駛',
        alternative: '改逛藏王溫泉街',
      },
    ]);
    expect(issues).toEqual([expect.objectContaining({ code: 'required', cell: 'D3' })]);
  });
});

describe('parseConstraintsSheet', () => {
  it('類型要是選項之一', () => {
    const s = sheet('旅伴限制', [
      ['類型*', '對象', '內容*'],
      ['飲食', '同行者', '不吃牛肉（可吃魚、雞、豬）'],
      ['過敏', null, '花生'],
      [null, null, '走路慢'],
    ]);
    const { constraints, issues } = parseConstraintsSheet(s);
    expect(constraints).toEqual([
      { key: '旅伴限制!2', kind: 'diet', subject: '同行者', content: '不吃牛肉（可吃魚、雞、豬）' },
    ]);
    expect(issues.map((issue) => [issue.code, issue.cell, issue.params?.value])).toEqual([
      ['invalidOption', 'A3', '過敏'],
      ['required', 'A4', undefined],
    ]);
  });
});
