import { describe, expect, it } from 'vitest';
import { parseWorkbook } from '@/lib/import/parse-workbook';
import { d, sheet } from './helpers';

const schedule = sheet('工作表1', [
  [d('2027-03-05'), null],
  ['東京', null],
  ['上午', '淺草寺'],
]);

describe('parseWorkbook', () => {
  it('第一張不是其他名稱的工作表是每日行程，名稱不限', () => {
    const draft = parseWorkbook([sheet('說明', [['填寫說明']]), schedule]);
    expect(draft.scheduleSheet).toBe('工作表1');
    expect(draft.items.map((item) => item.title)).toEqual(['淺草寺']);
  });

  it('沒有的工作表是 null，有資料的是陣列', () => {
    const draft = parseWorkbook([
      schedule,
      sheet('提醒事項', [
        ['主題*', '內容'],
        ['行李', null],
      ]),
    ]);
    expect(draft.notes).toEqual([{ key: '提醒事項!2', topic: '行李', content: null }]);
    expect(draft.stays).toBeNull();
    expect(draft.fallbacks).toBeNull();
    expect(draft.constraints).toBeNull();
  });

  it('只有標題列的工作表當作沒有，覆蓋時不會清空那一類', () => {
    const draft = parseWorkbook([
      schedule,
      sheet('住宿', [
        ['名稱*', '入住日*', '退房日*'],
        [null, null, null],
      ]),
      sheet('旅伴限制', [['類型*', '對象', '內容*']]),
      // 標題也缺的空白工作表不報「缺少欄位」
      sheet('提醒事項', []),
    ]);
    expect(draft.stays).toBeNull();
    expect(draft.constraints).toBeNull();
    expect(draft.notes).toBeNull();
    expect(draft.issues).toEqual([]);
  });
});
