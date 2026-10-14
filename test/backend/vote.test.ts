import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost } from '../../functions/api/vote';

const db = env.DB;
const run = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds).run();

// 2026-10-15 is a Thursday; Dhaka is UTC+6. Window is 09:00-14:00 by default.
const OPEN = '2026-10-15T05:00:00Z'; // 11:00 Dhaka
const BEFORE = '2026-10-15T02:00:00Z'; // 08:00 Dhaka
const AFTER = '2026-10-15T09:00:00Z'; // 15:00 Dhaka
const DAY = '2026-10-15';

const vote = (body: unknown) =>
  onRequestPost({
    request: new Request('http://x/api/vote', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env,
  } as unknown as Parameters<typeof onRequestPost>[0]);
const rows = async () => (await db.prepare('SELECT * FROM votes').all()).results;
const message = async (r: Response) => ((await r.json()) as { error: { message: string } }).error.message;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(OPEN));
  await db.batch([
    db.prepare('DELETE FROM votes'),
    db.prepare('DELETE FROM results'),
    db.prepare('DELETE FROM snacks'),
    db.prepare('DELETE FROM employees'),
    db.prepare(`UPDATE settings SET open_time = '09:00', cutoff_time = '14:00', working_days = '1,2,3,4,5'`),
    db.prepare(`INSERT INTO employees (id, name, active) VALUES (1, 'Ana', 1), (2, 'Old', 0)`),
    db.prepare(
      `INSERT INTO snacks (id, name, status) VALUES (1, 'Samosa', 'approved'), (2, 'Puri', 'approved'), (3, 'Pending', 'pending'), (4, 'Retired', 'retired')`,
    ),
  ]);
});
afterEach(() => vi.useRealTimers());

describe('POST /api/vote closed', () => {
  it('403s before opening, naming the opening time', async () => {
    vi.setSystemTime(new Date(BEFORE));
    const r = await vote({ employee_id: 1, snack_id: 1 });
    expect(r.status).toBe(403);
    expect(await message(r)).toContain('09:00');
    expect(await rows()).toHaveLength(0);
  });

  it('403s after cutoff, naming the cutoff time', async () => {
    vi.setSystemTime(new Date(AFTER));
    const r = await vote({ employee_id: 1, snack_id: 1 });
    expect(r.status).toBe(403);
    expect(await message(r)).toContain('14:00');
  });

  it('403s on a skipped day even inside the window', async () => {
    await run(`INSERT INTO results (day, status, method) VALUES (?, 'skipped', 'no_votes')`, DAY);
    const r = await vote({ employee_id: 1, snack_id: 1 });
    expect(r.status).toBe(403);
    expect(await message(r)).toMatch(/skipped/i);
  });

  it('403s on a decided day even inside the window', async () => {
    await run(`INSERT INTO results (day, status, winner_snack_id, method) VALUES (?, 'decided', 1, 'admin')`, DAY);
    const r = await vote({ employee_id: 1, snack_id: 1 });
    expect(r.status).toBe(403);
    expect(await rows()).toHaveLength(0);
  });
});

describe('POST /api/vote validation', () => {
  it('400s on bad JSON and non-integer ids', async () => {
    expect((await vote('nope')).status).toBe(400);
    expect((await vote({ employee_id: '1', snack_id: 1 })).status).toBe(400);
    expect((await vote({ employee_id: 1 })).status).toBe(400);
    expect((await vote({ employee_id: 1.5, snack_id: 1 })).status).toBe(400);
  });

  it('404s for an unknown or inactive employee', async () => {
    expect((await vote({ employee_id: 99, snack_id: 1 })).status).toBe(404);
    expect((await vote({ employee_id: 2, snack_id: 1 })).status).toBe(404);
    expect(await rows()).toHaveLength(0);
  });

  it('409s for a pending, retired or unknown snack', async () => {
    for (const snack_id of [3, 4, 99]) {
      expect((await vote({ employee_id: 1, snack_id })).status).toBe(409);
    }
    expect(await rows()).toHaveLength(0);
  });
});

describe('POST /api/vote upsert', () => {
  it('records a vote', async () => {
    const r = await vote({ employee_id: 1, snack_id: 1 });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(await rows()).toMatchObject([{ day: DAY, employee_id: 1, snack_id: 1 }]);
  });

  it('voting twice leaves one row with the latest snack', async () => {
    await vote({ employee_id: 1, snack_id: 1 });
    expect((await vote({ employee_id: 1, snack_id: 2 })).status).toBe(200);
    expect(await rows()).toMatchObject([{ day: DAY, employee_id: 1, snack_id: 2 }]);
  });

  it('two concurrent votes leave one row', async () => {
    const rs = await Promise.all([vote({ employee_id: 1, snack_id: 1 }), vote({ employee_id: 1, snack_id: 2 })]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(await rows()).toHaveLength(1);
  });
});
