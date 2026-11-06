import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseWorkbook } from '@/lib/import/parse-workbook';
import { readWorkbook } from '@/lib/import/read-workbook';

// 使用者實際的行程表（docs/samples/）：第 1–6 列是每日行程，第 14 列以後的區塊不是範本格式。
async function readSample() {
  const buffer = readFileSync(new URL('../../docs/samples/東北秘境探險.xlsx', import.meta.url));
  const sheets = await readWorkbook(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  return parseWorkbook(sheets);
}

describe('匯入範例檔', () => {
  it('讀出 10 天與每天的城市', async () => {
    const draft = await readSample();
    expect(draft.scheduleSheet).toBe('工作表1');
    expect(draft.days.map((day) => `${day.date} ${day.city}`)).toEqual([
      '2027-03-05 東京',
      '2027-03-06 東京',
      '2027-03-07 東京',
      '2027-03-08 仙台',
      '2027-03-09 藏王溫泉',
      '2027-03-10 山形市',
      '2027-03-11 銀山溫泉',
      '2027-03-12 仙台',
      '2027-03-13 仙台',
      '2027-03-14 仙台返台',
    ]);
  });

  it('每天 4 個項目；時段欄只有 S4 認不出來', async () => {
    const draft = await readSample();
    expect(draft.items).toHaveLength(40);
    // S4 在時段欄寫了一段內容（範例檔本身的資料問題），歸到整天並提醒。
    expect(draft.items.filter((item) => item.timeSlotGuessed).map((item) => item.key)).toEqual([
      '工作表1!T4',
    ]);
    expect(draft.items.find((item) => item.key === '工作表1!B3')).toMatchObject({
      date: '2027-03-05',
      startTime: '17:00',
      timeSlot: 'evening',
      title: '抵達東京機場',
      description: '（羽田／成田待確認），搭車前往飯店',
      category: 'transport',
    });
    expect(draft.items.find((item) => item.key === '工作表1!N6')).toMatchObject({
      timeSlot: 'evening',
      title: '回山形站附近飯店，晚餐與休息',
    });
    expect(draft.items.find((item) => item.key === '工作表1!T6')).toMatchObject({
      timeSlot: 'all_day',
      category: 'reminder',
    });
  });

  it('沒有其他工作表；提醒 S4 與第 14 列以後未匯入', async () => {
    const draft = await readSample();
    expect(draft.stays).toBeNull();
    expect(draft.notes).toBeNull();
    expect(draft.fallbacks).toBeNull();
    expect(draft.constraints).toBeNull();
    expect(draft.issues.map((issue) => [issue.severity, issue.code, issue.cell])).toEqual([
      ['warning', 'timeSlotUnrecognized', 'S4'],
      ['warning', 'rowsIgnored', 'A14'],
    ]);
  });
});
