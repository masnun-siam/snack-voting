// Read-only day state. Computed from `results` + `settings` + `now` on every call; nothing is stored or cached (FR-11).
import { dayWindowStatus, dhakaDay, type WindowSettings } from './time';

export type DayStatus = 'closed' | 'open' | 'decided' | 'skipped';

export interface ResultRow {
  day: string;
  status: 'decided' | 'skipped';
  winner_snack_id: number | null;
  method: 'votes' | 'tie_random' | 'admin' | 'no_votes';
  counts: string; // JSON text
  decided_at: string;
}

export interface DayState {
  day: string;
  status: DayStatus;
  window: { open_time: string; cutoff_time: string };
  result: ResultRow | null;
}

export async function getSettings(db: D1Database): Promise<WindowSettings> {
  const row = await db.prepare('SELECT open_time, cutoff_time, working_days FROM settings WHERE id = 1').first<WindowSettings>();
  if (!row) throw new Error('settings row missing');
  return row;
}

export async function getDayState(db: D1Database, now: Date): Promise<DayState> {
  const day = dhakaDay(now);
  const [settings, result] = await Promise.all([
    getSettings(db),
    db.prepare('SELECT * FROM results WHERE day = ?').bind(day).first<ResultRow>(),
  ]);
  const window = { open_time: settings.open_time, cutoff_time: settings.cutoff_time };
  // A results row wins; otherwise the window decides. Everything but 'open' is 'closed'.
  const status: DayStatus = result ? result.status : dayWindowStatus(settings, now) === 'open' ? 'open' : 'closed';
  return { day, status, window, result };
}
