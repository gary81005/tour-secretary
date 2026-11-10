import { describe, expect, it } from 'vitest';
import { isImportUndoable } from '@/lib/import/undo';

const now = new Date('2027-04-10T12:00:00Z');
const undoable = (created_at: string, undone_at: string | null = null) =>
  isImportUndoable({ created_at, undone_at }, now);

describe('isImportUndoable', () => {
  it('30 天內、尚未復原的可以復原', () => {
    expect(undoable('2027-03-11T12:00:00Z')).toBe(true);
    expect(undoable('2027-04-10T11:00:00Z')).toBe(true);
  });

  it('超過 30 天或已經復原過的不行', () => {
    expect(undoable('2027-03-11T11:59:00Z')).toBe(false);
    expect(undoable('2027-04-09T12:00:00Z', '2027-04-09T13:00:00Z')).toBe(false);
  });
});
