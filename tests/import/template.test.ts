import { describe, expect, it } from 'vitest';
import { loadExcelJS } from '@/lib/import/exceljs';
import { matchFallbacks } from '@/lib/import/fallbacks';
import { parseWorkbook } from '@/lib/import/parse-workbook';
import { readWorkbook } from '@/lib/import/read-workbook';
import { buildTemplate } from '@/lib/import/template';
import { SHEET_NAMES } from '@/lib/import/vocabulary';

// 範本產生後再用同一套解析讀回來：範本本身不能有任何錯誤或警告。
async function roundTrip() {
  const bytes = await buildTemplate();
  return { bytes, draft: parseWorkbook(await readWorkbook(bytes.slice().buffer)) };
}

describe('buildTemplate', () => {
  it('解析範本沒有任何錯誤或警告', async () => {
    const { draft } = await roundTrip();
    expect(draft.issues).toEqual([]);
  });

  it('包含每日行程與所有結構化資料', async () => {
    const { draft } = await roundTrip();
    expect(draft.scheduleSheet).toBe(SHEET_NAMES.schedule);
    expect(draft.days).toEqual([
      { date: '2027-03-05', city: '東京' },
      { date: '2027-03-06', city: '東京' },
      { date: '2027-03-07', city: '仙台' },
    ]);
    expect(draft.items).toHaveLength(10);
    expect(draft.items.find((item) => item.title === '新宿夜景')).toMatchObject({
      startTime: '19:00',
      endTime: '21:00',
      timeSlot: 'night',
    });
    expect(draft.stays).toHaveLength(1);
    expect(draft.notes).toHaveLength(2);
    expect(draft.constraints).toEqual([
      expect.objectContaining({ kind: 'diet', subject: '同行者' }),
    ]);
  });

  it('範例備案掛得到範例項目', async () => {
    const { draft } = await roundTrip();
    const matches = matchFallbacks(draft.fallbacks ?? [], draft.items);
    expect([...matches.values()].map((item) => item?.key)).toEqual(['行程!D5']);
  });

  it('工作表順序與下拉選單', async () => {
    const { bytes } = await roundTrip();
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.slice().buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      SHEET_NAMES.schedule,
      SHEET_NAMES.stays,
      SHEET_NAMES.notes,
      SHEET_NAMES.fallbacks,
      SHEET_NAMES.constraints,
      SHEET_NAMES.instructions,
    ]);

    const schedule = workbook.getWorksheet(SHEET_NAMES.schedule)!;
    // 時段欄可以填時間，所以選單不擋其他值。
    const slotDropdown = schedule.getCell('C3').dataValidation;
    expect(slotDropdown).toMatchObject({
      type: 'list',
      formulae: ['"整天,清晨,上午,中午,下午,傍晚,晚上"'],
    });
    expect(slotDropdown.showErrorMessage ?? false).toBe(false);
    expect(schedule.getCell('AA32').dataValidation).toMatchObject({ type: 'list' });
    expect(workbook.getWorksheet(SHEET_NAMES.stays)!.getCell('E2').dataValidation).toMatchObject({
      formulae: ['"候選,已預訂,已付款"'],
      showErrorMessage: true,
    });
    expect(
      workbook.getWorksheet(SHEET_NAMES.constraints)!.getCell('A50').dataValidation,
    ).toMatchObject({
      formulae: ['"飲食,體力,行動,偏好,其他"'],
    });
  });
});
