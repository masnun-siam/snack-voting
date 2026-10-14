import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDayState, getSettings } from '../../functions/_lib/day';

const db = env.DB;
const run = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds).run();
const at = (iso: string) => new Date(iso);

// Storage is shared across tests in a file, so reset the tables these tests touch.
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM results'),
    db.prepare('DELETE FROM snacks'),
    db.prepare(`UPDATE settings SET open_time = '09:00', cutoff_time = '14:00', working_days = '1,2,3,4,5'`),
  ]);
});

// 2026-10-15 is a Thursday; Dhaka is UTC+6. 09:00 open, 14:00 cutoff by default.
const OPEN = at('2026-10-15T05:00:00Z'); // 11:00 Dhaka
const BEFORE = at('2026-10-15T02:00:00Z'); // 08:00 Dhaka
const AFTER = at('2026-10-15T09:00:00Z'); // 15:00 Dhaka
const SATURDAY = at('2026-10-17T05:00:00Z');

describe('getSettings', () => {
  it('returns the single settings row', async () => {
    expect(await getSettings(db)).toEqual({ open_time: '09:00', cutoff_time: '14:00', working_days: '1,2,3,4,5' });
  });
});

describe('getDayState with a results row', () => {
  it('reports skipped when the day was skipped, even inside the window', async () => {
    await run(`INSERT INTO results (day, status, method) VALUES ('2026-10-15', 'skipped', 'no_votes')`);
    const s = await getDayState(db, OPEN);
    expect(s.status).toBe('skipped');
    expect(s.day).toBe('2026-10-15');
  });

  it('reports decided and includes the stored result', async () => {
    await run(`INSERT INTO snacks (id, name) VALUES (1, 'Samosa')`);
    await run(
      `INSERT INTO results (day, status, winner_snack_id, method, counts) VALUES ('2026-10-15', 'decided', 1, 'votes', '{"1":3}')`,
    );
    const s = await getDayState(db, AFTER);
    expect(s.status).toBe('decided');
    expect(s.result).toMatchObject({ day: '2026-10-15', status: 'decided', winner_snack_id: 1, method: 'votes', counts: '{"1":3}' });
  });

  it('ignores results rows for other days', async () => {
    await run(`INSERT INTO results (day, status, method) VALUES ('2026-10-14', 'skipped', 'no_votes')`);
    const s = await getDayState(db, OPEN);
    expect(s.status).toBe('open');
    expect(s.result).toBeNull();
  });
});

describe('getDayState without a results row', () => {
  it('is open inside the window', async () => {
    const s = await getDayState(db, OPEN);
    expect(s).toEqual({
      day: '2026-10-15',
      status: 'open',
      window: { open_time: '09:00', cutoff_time: '14:00' },
      result: null,
    });
  });
  it('is closed before opening', async () => {
    expect((await getDayState(db, BEFORE)).status).toBe('closed');
  });
  it('is closed after cutoff while undecided', async () => {
    expect((await getDayState(db, AFTER)).status).toBe('closed');
  });
  it('is closed on a non-working day', async () => {
    expect((await getDayState(db, SATURDAY)).status).toBe('closed');
  });
});

describe('settings changes apply immediately (FR-11)', () => {
  it('moving cutoff_time flips the status of the same instant', async () => {
    expect((await getDayState(db, OPEN)).status).toBe('open');
    await run(`UPDATE settings SET cutoff_time = '10:00'`);
    const s = await getDayState(db, OPEN);
    expect(s.status).toBe('closed');
    expect(s.window.cutoff_time).toBe('10:00');
    await run(`UPDATE settings SET cutoff_time = '14:00'`);
    expect((await getDayState(db, OPEN)).status).toBe('open');
  });

  it('writes nothing to the DB', async () => {
    const count = async () =>
      (await db.prepare(`SELECT (SELECT count(*) FROM results) r, (SELECT count(*) FROM votes) v, (SELECT count(*) FROM settings) s`).first())!;
    const before = await count();
    await getDayState(db, OPEN);
    await getDayState(db, AFTER);
    expect(await count()).toEqual(before);
  });
});
