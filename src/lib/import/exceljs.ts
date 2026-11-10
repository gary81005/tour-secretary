// exceljs 很大，只在真的要讀檔或產生範本時動態載入（ADR 0008）。
export async function loadExcelJS() {
  const mod = await import('exceljs');
  // exceljs 是 CommonJS 套件：依打包工具不同，類別可能在 default 底下。
  return (mod as unknown as { default?: typeof mod }).default ?? mod;
}
