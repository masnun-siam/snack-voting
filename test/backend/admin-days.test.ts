import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as skip } from '../../functions/api/admin/days/[day]/skip';
import { onRequestPost as override } from '../../functions/api/admin/days/[day]/override';
import { onRequestPost as vote } from '../../functions/api/vote';
import { onRequestGet as history } from '../../functions/api/history';
import { getDayState } from '../../functions/_lib/day';

const db = env.DB;
const run = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds).run();

// 2026-10-15 is a Thursday; Dhaka is UTC+6. Window is 09:00-14:00.
const OPEN = '2026-10-15T05:00:00Z'; // 11:00 Dhaka
const AFTER = '2026-10-15T09:00:00Z'; // 15:00 Dhaka
const DAY = '2026-10-15';
const PAST = '2026-10-14';

const call = (fn: typeof skip, day: string, body?: unknown) =>
  fn({
    request: new Request('http://x', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
    env,
    params: { day },
  } as unknown as Parameters<typeof skip>[0]);
const results = async () => (await db.prepare('SELECT * FROM results').all()).results;
const decide = (day: string, winner: number | null, method = 'votes') =>
  run(`INSERT INTO results (day, status, winner_snack_id, method, counts) VALUES (?, 'decided', ?, ?, '[]')`, day, winner, method);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(OPEN));
  await db.batch([
    db.prepare('DELETE FROM votes'),
    db.prepare('DELETE FROM results'),
    db.prepare('DELETE FROM snacks'),
    db.prepare('DELETE FROM employees'),
    db.prepare(`UPDATE settings SET open_time = '09:00', cutoff_time = '14:00', working_days = '1,2,3,4,5'`),
    db.prepare(`INSERT INTO employees (id, name) VALUES (1, 'Ana')`),
    db.prepare(`INSERT INTO snacks (id, name, status) VALUES (1, 'Samosa', 'approved'), (2, 'Tea', 'approved'), (3, 'Old', 'retired')`),
  ]);
});
afterEach(() => vi.useRealTimers());

describe('POST /api/admin/days/:day/skip', () => {
  it('skips today before cutoff: state is skipped and /vote 403s', async () => {
    const r = await call(skip, DAY);
    expect(r.status).toBe(200);
    expect(await results()).toMatchObject([{ day: DAY, status: 'skipped', winner_snack_id: null, method: 'no_votes' }]);
    expect((await getDayState(db, new Date())).status).toBe('skipped');
    const v = await vote({
      request: new Request('http://x', { method: 'POST', body: JSON.stringify({ employee_id: 1, snack_id: 1 }) }),
      env,
    } as unknown as Parameters<typeof vote>[0]);
    expect(v.status).toBe(403);
  });

  it('409s for an already decided day', async () => {
    await decide(DAY, 1);
    expect((await call(skip, DAY)).status).toBe(409);
    expect(await results()).toMatchObject([{ status: 'decided' }]);
  });

  it('409s for an already skipped day', async () => {
    expect((await call(skip, DAY)).status).toBe(200);
    expect((await call(skip, DAY)).status).toBe(409);
  });

  it('409s after cutoff', async () => {
    vi.setSystemTime(new Date(AFTER));
    expect((await call(skip, DAY)).status).toBe(409);
    expect(await results()).toHaveLength(0);
  });

  it('409s for a day that is not today', async () => {
    expect((await call(skip, PAST)).status).toBe(409);
    expect(await results()).toHaveLength(0);
  });

  it('400s for a malformed day', async () => {
    for (const d of ['15-10-2026', '2026-1-5', 'today', '2026-13-45']) expect((await call(skip, d)).status).toBe(400);
  });
});

describe('POST /api/admin/days/:day/override', () => {
  it('replaces the winner, sets method admin, visible in state and history', async () => {
    await decide(DAY, 1);
    const r = await call(override, DAY, { snack_id: 2 });
    expect(r.status).toBe(200);
    const state = await getDayState(db, new Date());
    expect(state.result).toMatchObject({ winner_snack_id: 2, method: 'admin' });
    const h = (await (await history({ env } as unknown as Parameters<typeof history>[0])).json()) as { winner: string; method: string }[];
    expect(h[0]).toMatchObject({ winner: 'Tea', method: 'admin' });
  });

  it('accepts a no-votes decided day and a retired snack', async () => {
    await decide(PAST, null, 'no_votes');
    expect((await call(override, PAST, { snack_id: 3 })).status).toBe(200);
    expect(await results()).toMatchObject([{ winner_snack_id: 3, method: 'admin' }]);
  });

  it('404s for an unknown snack', async () => {
    await decide(PAST, 1);
    expect((await call(override, PAST, { snack_id: 99 })).status).toBe(404);
    expect(await results()).toMatchObject([{ winner_snack_id: 1, method: 'votes' }]);
  });

  it('409s for an undecided day', async () => {
    expect((await call(override, PAST, { snack_id: 1 })).status).toBe(409);
    expect(await results()).toHaveLength(0);
  });

  it('409s for a skipped day', async () => {
    await call(skip, DAY);
    expect((await call(override, DAY, { snack_id: 1 })).status).toBe(409);
    expect(await results()).toMatchObject([{ status: 'skipped', winner_snack_id: null }]);
  });

  it('400s for a malformed day, bad body or non-integer snack_id', async () => {
    await decide(PAST, 1);
    expect((await call(override, 'nope', { snack_id: 1 })).status).toBe(400);
    expect((await call(override, PAST, { snack_id: '2' })).status).toBe(400);
    expect((await call(override, PAST, {})).status).toBe(400);
    const r = await override({
      request: new Request('http://x', { method: 'POST', body: 'not json' }),
      env,
      params: { day: PAST },
    } as unknown as Parameters<typeof override>[0]);
    expect(r.status).toBe(400);
  });
});
