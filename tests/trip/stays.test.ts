import { describe, expect, it } from 'vitest';
import { findOverlappingStayIds, staysForNight, validateStayRange } from '@/lib/trip/stays';

const trip = { start_date: '2027-03-05', end_date: '2027-03-14' };
const stay = (id: string, check_in: string, check_out: string) => ({ id, check_in, check_out });

describe('validateStayRange', () => {
  it('退房要晚於入住', () => {
    expect(validateStayRange(stay('a', '2027-03-06', '2027-03-06'), trip)).toBe(
      'checkOutNotAfterCheckIn',
    );
  });

  it('退房日可以是行程最後一天', () => {
    expect(validateStayRange(stay('a', '2027-03-13', '2027-03-14'), trip)).toBeNull();
    expect(validateStayRange(stay('a', '2027-03-05', '2027-03-06'), trip)).toBeNull();
  });

  it('超出行程範圍', () => {
    expect(validateStayRange(stay('a', '2027-03-04', '2027-03-06'), trip)).toBe('outsideTrip');
    expect(validateStayRange(stay('a', '2027-03-13', '2027-03-15'), trip)).toBe('outsideTrip');
  });
});

describe('findOverlappingStayIds', () => {
  it('退房當天入住下一間不算重疊', () => {
    const ids = findOverlappingStayIds([
      stay('tokyo', '2027-03-05', '2027-03-07'),
      stay('sendai', '2027-03-07', '2027-03-08'),
    ]);
    expect([...ids]).toEqual([]);
  });

  it('重疊的兩筆都會標出來', () => {
    const ids = findOverlappingStayIds([
      stay('tokyo', '2027-03-05', '2027-03-07'),
      stay('sendai', '2027-03-07', '2027-03-08'),
      stay('extra-room', '2027-03-06', '2027-03-07'),
    ]);
    expect([...ids].sort()).toEqual(['extra-room', 'tokyo']);
  });
});

describe('staysForNight', () => {
  const stays = [
    stay('tokyo', '2027-03-05', '2027-03-07'),
    stay('sendai', '2027-03-07', '2027-03-08'),
  ];

  it('入住日 ≤ 那晚 < 退房日', () => {
    expect(staysForNight(stays, '2027-03-05').map((s) => s.id)).toEqual(['tokyo']);
    expect(staysForNight(stays, '2027-03-06').map((s) => s.id)).toEqual(['tokyo']);
    expect(staysForNight(stays, '2027-03-07').map((s) => s.id)).toEqual(['sendai']);
    expect(staysForNight(stays, '2027-03-08')).toEqual([]);
  });
});
