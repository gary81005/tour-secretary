import { describe, expect, it } from 'vitest';
import { adjustmentPlanSchema } from '@/lib/trip/adjustment-schema';

const ITEM = '11111111-1111-4111-8111-111111111111';
const DAY = '22222222-2222-4222-8222-222222222222';
const UPDATED = '2026-11-17T01:02:03.456789+00:00';

describe('adjustmentPlanSchema', () => {
  it('accepts every op kind', () => {
    const plan = {
      ops: [
        {
          op: 'set_time',
          item_id: ITEM,
          expected_updated_at: UPDATED,
          start_time: '10:30',
          end_time: null,
          time_slot: 'morning',
        },
        { op: 'skip', item_id: ITEM, expected_updated_at: UPDATED },
        {
          op: 'add_item',
          day_id: DAY,
          title: '改去附近的咖啡廳',
          time_slot: 'afternoon',
          category: 'meal',
          start_time: '14:00:00',
          end_time: '15:00',
          replaces_item_id: ITEM,
        },
      ],
    };
    expect(adjustmentPlanSchema.parse(plan)).toEqual(plan);
  });

  it('drops fields that are not part of the op', () => {
    const parsed = adjustmentPlanSchema.parse({
      ops: [{ op: 'skip', item_id: ITEM, expected_updated_at: UPDATED, skipped_at: 'now' }],
    });
    expect(parsed.ops[0]).toEqual({ op: 'skip', item_id: ITEM, expected_updated_at: UPDATED });
  });

  it.each([
    ['an empty plan', { ops: [] }],
    ['an unknown op', { ops: [{ op: 'delete', item_id: ITEM }] }],
    ['a non-uuid item', { ops: [{ op: 'skip', item_id: 'x', expected_updated_at: UPDATED }] }],
    [
      'a time past midnight',
      {
        ops: [
          {
            op: 'set_time',
            item_id: ITEM,
            expected_updated_at: UPDATED,
            start_time: '24:15',
            end_time: null,
            time_slot: 'night',
          },
        ],
      },
    ],
    [
      'a blank title',
      {
        ops: [
          {
            op: 'add_item',
            day_id: DAY,
            title: '  ',
            time_slot: 'morning',
            category: 'meal',
            start_time: null,
            end_time: null,
            replaces_item_id: null,
          },
        ],
      },
    ],
  ])('rejects %s', (_, plan) => {
    expect(adjustmentPlanSchema.safeParse(plan).success).toBe(false);
  });
});
