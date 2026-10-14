// Pure time/window logic. Everything is evaluated in Asia/Dhaka local time; `now` is always passed in.

export type WindowStatus = 'not_working_day' | 'before_open' | 'open' | 'after_cutoff';

export interface WindowSettings {
  open_time: string; // 'HH:MM'
  cutoff_time: string; // 'HH:MM'
  working_days: string; // comma-separated ISO weekdays, 1 = Monday .. 7 = Sunday
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }); // YYYY-MM-DD
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Dhaka calendar date as YYYY-MM-DD. */
export function dhakaDay(now: Date): string {
  return dayFmt.format(now);
}

/** 'HH:MM' (00:00-23:59) to minutes since midnight, or null when malformed. */
function toMinutes(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function isValidWindow(open: string, cutoff: string): boolean {
  const o = toMinutes(open);
  const c = toMinutes(cutoff);
  return o !== null && c !== null && c > o;
}

/** Open is inclusive, cutoff is exclusive. */
export function dayWindowStatus(settings: WindowSettings, now: Date): WindowStatus {
  const isoWeekday = new Date(`${dhakaDay(now)}T00:00:00Z`).getUTCDay() || 7; // Sunday 0 -> 7
  if (!settings.working_days.split(',').map((d) => d.trim()).includes(String(isoWeekday))) {
    return 'not_working_day';
  }
  const [h, min] = clockFmt.format(now).split(':').map(Number);
  const minutes = h * 60 + min;
  if (minutes < toMinutes(settings.open_time)!) return 'before_open';
  if (minutes < toMinutes(settings.cutoff_time)!) return 'open';
  return 'after_cutoff';
}
