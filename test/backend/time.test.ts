import { describe, expect, it } from 'vitest';
import { dayWindowStatus, dhakaDay, isValidWindow } from '../../functions/_lib/time';

const settings = { open_time: '09:00', cutoff_time: '14:00', working_days: '1,2,3,4,5' };
const at = (iso: string) => new Date(iso);

describe('dhakaDay', () => {
  it('returns the Dhaka date, not the UTC date', () => {
    expect(dhakaDay(at('2026-10-15T17:59:00Z'))).toBe('2026-10-15');
    expect(dhakaDay(at('2026-10-15T19:00:00Z'))).toBe('2026-10-16');
  });
});

describe('dayWindowStatus', () => {
  // 2026-10-15 is a Thursday; Dhaka is UTC+6.
  it('is before_open until 09:00 Dhaka', () => {
    expect(dayWindowStatus(settings, at('2026-10-15T02:59:00Z'))).toBe('before_open');
  });
  it('is open from 09:00 inclusive', () => {
    expect(dayWindowStatus(settings, at('2026-10-15T03:00:00Z'))).toBe('open');
  });
  it('is still open at 13:59', () => {
    expect(dayWindowStatus(settings, at('2026-10-15T07:59:00Z'))).toBe('open');
  });
  it('is after_cutoff from 14:00 inclusive', () => {
    expect(dayWindowStatus(settings, at('2026-10-15T08:00:00Z'))).toBe('after_cutoff');
  });
  it('is not_working_day on Saturday and Sunday by default', () => {
    expect(dayWindowStatus(settings, at('2026-10-17T05:00:00Z'))).toBe('not_working_day');
    expect(dayWindowStatus(settings, at('2026-10-18T05:00:00Z'))).toBe('not_working_day');
  });
  it('uses the Dhaka weekday, not the UTC weekday', () => {
    // Fri 20:00 UTC is already Sat 02:00 in Dhaka.
    expect(dayWindowStatus(settings, at('2026-10-16T20:00:00Z'))).toBe('not_working_day');
    // Sun 19:00 UTC is already Mon 01:00 in Dhaka.
    expect(dayWindowStatus(settings, at('2026-10-18T19:00:00Z'))).toBe('before_open');
  });
  it('honours configured window and working days', () => {
    const s = { open_time: '10:30', cutoff_time: '11:00', working_days: '6' };
    expect(dayWindowStatus(s, at('2026-10-17T04:30:00Z'))).toBe('open');
    expect(dayWindowStatus(s, at('2026-10-15T04:30:00Z'))).toBe('not_working_day');
  });
});

describe('isValidWindow', () => {
  it('accepts a well-formed window', () => {
    expect(isValidWindow('09:00', '14:00')).toBe(true);
  });
  it.each([
    ['09:00', '09:00'],
    ['14:00', '09:00'],
    ['9:00', '14:00'],
    ['09:00', '25:00'],
    ['09:00', '14:60'],
    ['', '14:00'],
    ['09:00', ''],
  ])('rejects %j -> %j', (open, cutoff) => {
    expect(isValidWindow(open, cutoff)).toBe(false);
  });
});
