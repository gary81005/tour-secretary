import type { DataValidation, Workbook, Worksheet } from 'exceljs';
import { cellAddress } from './cells';
import { loadExcelJS } from './exceljs';
import {
  CONSTRAINT_KIND_LABELS,
  SHEET_NAMES,
  STAY_STATUS_LABELS,
  TABLE_HEADERS,
  TIME_SLOT_LABELS,
} from './vocabulary';

// 下載用的 xlsx 範本（ADR 0008 Q10）：在瀏覽器即時產生，選項永遠與程式一致。
// 範本是 zh-TW 的檔案格式，範例與說明文字寫在這裡，不走翻譯檔。

// 下拉選單涵蓋的範圍：行程最多 60 天，但一般不會超過兩週，再多就只是沒有選單，照樣可以填。
const DROPDOWN_DAYS = 14;
const DROPDOWN_ROWS = 30;
const TABLE_DROPDOWN_ROWS = 100;

const DATE_FORMAT = 'yyyy/m/d';

type Cell = string | Date | null;
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

// 第一天 3/5、第二天 3/6 在東京（城市合併兩天），第三天移動到仙台。
const SCHEDULE_DATES = ['2027-03-05', '2027-03-06', '2027-03-07'];
const SCHEDULE_CITIES: { city: string; fromDay: number; toDay: number }[] = [
  { city: '東京', fromDay: 0, toDay: 1 },
  { city: '仙台', fromDay: 2, toDay: 2 },
];
// 每一列：每天一組 [時段, 內容]。
const SCHEDULE_ROWS: [Cell, Cell][][] = [
  [
    ['約17:00', '抵達東京機場\n搭車前往飯店，Check-in'],
    ['上午', '淺草寺、仲見世通'],
    ['上午', '東京退房；\n搭乘東北新幹線前往仙台，抵達後先寄放行李'],
  ],
  [
    ['晚餐', '東京市區用餐、早點休息'],
    ['中午', '淺草午餐'],
    ['下午', '定禪寺通、勾當台公園散步'],
  ],
  [
    [null, null],
    ['下午', '晴空塔、上野或秋葉原'],
    ['晚餐', '仙台牛舌；\n同行者不吃牛肉，先確認分店有非牛肉主餐'],
  ],
  [
    [null, null],
    ['19:00-21:00', '新宿夜景'],
    ['提醒', '確認隔天前往藏王的巴士班次'],
  ],
];

const INSTRUCTIONS = [
  '這份範本可以直接匯入「旅遊秘書」。範例內容刪掉後，填入自己的行程即可。',
  '',
  '【行程】',
  '・第 1 列填日期（含年份，例如 2027/3/5），每天佔 2 欄；中間跳過的日期會自動補成空白的一天。',
  '・第 2 列填城市；同一個城市連續好幾天，可以合併儲存格。',
  '・從第 3 列開始，每天的左欄填時段、右欄填內容；讀到第一個整列空白的列就停止。',
  `・時段可以填：${Object.values(TIME_SLOT_LABELS).join('、')}；`,
  '  也可以填時間，例如 17:00、約17:00、13:30-14:00；早上、早餐、午餐、晚餐、住宿、提醒也看得懂。',
  '・內容的第一行是標題，在儲存格內換行之後是說明。',
  '・類別會依內容推測（交通、餐食、住宿、購物，其他是景點），匯入前可以在預覽修改。',
  '',
  '【住宿】【提醒事項】【備案】【旅伴限制】',
  '・不需要的工作表可以整張刪掉；標題有 * 的欄位必填。',
  '・日期請填含年份的格式，例如 2027/3/5。',
  '・住宿的入住到退房要在行程日期內，退房日可以是行程最後一天。',
  '・備案的「日期」與「項目標題」要和【行程】裡那一格內容的第一行相同，才會掛到那個項目下。',
  '',
  '【匯入到既有行程】',
  '・附加：檔案內容加到行程裡，已經有的資料預設不重複匯入。',
  '・覆蓋：檔案有寫到的日期整天換掉；有【住宿】等工作表時，那一類資料整批換掉。匯入後 30 天內可以復原。',
];

export async function buildTemplate(): Promise<Uint8Array> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  addScheduleSheet(workbook);
  addStaysSheet(workbook);
  addNotesSheet(workbook);
  addFallbacksSheet(workbook);
  addConstraintsSheet(workbook);
  addInstructionsSheet(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function listValidation(options: readonly string[], strict: boolean): DataValidation {
  return {
    type: 'list',
    allowBlank: true,
    formulae: [`"${options.join(',')}"`],
    // 時段欄也可以填時間，所以不擋選單以外的值。
    showErrorMessage: strict,
    ...(strict && { errorTitle: '請從選單選擇', error: `可以填：${options.join('、')}` }),
  };
}

// 用範圍登記下拉選單。逐格設定 cell.dataValidation 時，exceljs 4.4 合併範圍會依字串排序
// （A10 排在 A3 前面），產生重疊的範圍，Excel 開檔時可能要求修復。
// worksheet.dataValidations 沒有寫在型別定義裡，但寫檔時支援範圍位址。
function addValidation(sheet: Worksheet, range: string, validation: DataValidation) {
  (
    sheet as unknown as {
      dataValidations: { add: (address: string, validation: DataValidation) => void };
    }
  ).dataValidations.add(range, validation);
}

function addScheduleSheet(workbook: Workbook) {
  const sheet = workbook.addWorksheet(SHEET_NAMES.schedule, {
    views: [{ state: 'frozen', ySplit: 2 }],
  });
  const slotValidation = listValidation(Object.values(TIME_SLOT_LABELS), false);

  for (let day = 0; day < DROPDOWN_DAYS; day++) {
    const timeCol = day * 2;
    sheet.getColumn(timeCol + 1).width = 11;
    sheet.getColumn(timeCol + 2).width = 30;
    const range = `${cellAddress(2, timeCol)}:${cellAddress(DROPDOWN_ROWS + 1, timeCol)}`;
    addValidation(sheet, range, slotValidation);
  }

  SCHEDULE_DATES.forEach((iso, day) => {
    const cell = sheet.getCell(1, day * 2 + 1);
    cell.value = date(iso);
    cell.numFmt = DATE_FORMAT;
    sheet.mergeCells(1, day * 2 + 1, 1, day * 2 + 2);
  });
  for (const { city, fromDay, toDay } of SCHEDULE_CITIES) {
    sheet.getCell(2, fromDay * 2 + 1).value = city;
    sheet.mergeCells(2, fromDay * 2 + 1, 2, toDay * 2 + 2);
  }
  SCHEDULE_ROWS.forEach((days, index) => {
    days.forEach(([time, content], day) => {
      sheet.getCell(index + 3, day * 2 + 1).value = time;
      sheet.getCell(index + 3, day * 2 + 2).value = content;
    });
  });

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(2).font = { bold: true };
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true };
  });
}

type Column = { header: string; required?: boolean; width: number; date?: boolean };

// 結構化工作表：第 1 列是標題（必填加「*」），之後是範例資料。
function addTableSheet(workbook: Workbook, name: string, columns: Column[], rows: Cell[][]) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({
    header: column.required ? `${column.header}*` : column.header,
    width: column.width,
    ...(column.date && { style: { numFmt: DATE_FORMAT } }),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(rows);
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  return sheet;
}

// col 從 0 起算；範圍從標題下一列開始。
function addDropdown(sheet: Worksheet, col: number, options: readonly string[]) {
  const range = `${cellAddress(1, col)}:${cellAddress(TABLE_DROPDOWN_ROWS, col)}`;
  addValidation(sheet, range, listValidation(options, true));
}

function addStaysSheet(workbook: Workbook) {
  const h = TABLE_HEADERS.stays;
  const sheet = addTableSheet(
    workbook,
    SHEET_NAMES.stays,
    [
      { header: h.name, required: true, width: 24 },
      { header: h.checkIn, required: true, width: 12, date: true },
      { header: h.checkOut, required: true, width: 12, date: true },
      { header: h.address, width: 20 },
      { header: h.status, width: 10 },
      { header: h.confirmationCode, width: 12 },
      { header: h.url, width: 30 },
      { header: h.note, width: 30 },
    ],
    [
      [
        '東京站周邊飯店',
        date('2027-03-05'),
        date('2027-03-07'),
        '東京站／上野',
        STAY_STATUS_LABELS.booked,
        'ABC123',
        null,
        '同一間連住兩晚',
      ],
    ],
  );
  addDropdown(sheet, 4, Object.values(STAY_STATUS_LABELS));
}

function addNotesSheet(workbook: Workbook) {
  const h = TABLE_HEADERS.notes;
  addTableSheet(
    workbook,
    SHEET_NAMES.notes,
    [
      { header: h.topic, required: true, width: 16 },
      { header: h.content, width: 60 },
    ],
    [
      ['交通方向', '3/5 東京進，3/7 搭新幹線前往仙台。'],
      ['行李', '東北段盡量精簡行李；雪地請穿防滑鞋。'],
    ],
  );
}

function addFallbacksSheet(workbook: Workbook) {
  const h = TABLE_HEADERS.fallbacks;
  addTableSheet(
    workbook,
    SHEET_NAMES.fallbacks,
    [
      { header: h.date, required: true, width: 12, date: true },
      { header: h.itemTitle, required: true, width: 24 },
      { header: h.condition, width: 20 },
      { header: h.alternative, required: true, width: 30 },
    ],
    [[date('2027-03-06'), '晴空塔、上野或秋葉原', '下雨', '改逛上野的博物館']],
  );
}

function addConstraintsSheet(workbook: Workbook) {
  const h = TABLE_HEADERS.constraints;
  const sheet = addTableSheet(
    workbook,
    SHEET_NAMES.constraints,
    [
      { header: h.kind, required: true, width: 10 },
      { header: h.subject, width: 12 },
      { header: h.content, required: true, width: 40 },
    ],
    [[CONSTRAINT_KIND_LABELS.diet, '同行者', '不吃牛肉（可吃魚、雞、豬）']],
  );
  addDropdown(sheet, 0, Object.values(CONSTRAINT_KIND_LABELS));
}

function addInstructionsSheet(workbook: Workbook) {
  const sheet = workbook.addWorksheet(SHEET_NAMES.instructions);
  sheet.getColumn(1).width = 100;
  INSTRUCTIONS.forEach((line) => sheet.addRow([line]));
  sheet.getCell('A1').font = { bold: true };
}
