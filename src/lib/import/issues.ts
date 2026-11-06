import type { ImportIssue } from './types';

export type AddIssue = (
  severity: ImportIssue['severity'],
  code: ImportIssue['code'],
  cell: string | null,
  params?: ImportIssue['params'],
) => void;

// 收集同一張工作表的錯誤與警告。
export function collectIssues(sheet: string): { issues: ImportIssue[]; add: AddIssue } {
  const issues: ImportIssue[] = [];
  const add: AddIssue = (severity, code, cell, params) => {
    issues.push({ severity, code, sheet, cell, ...(params && { params }) });
  };
  return { issues, add };
}

export function hasErrors(issues: readonly ImportIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
