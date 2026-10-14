import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../functions/api/state';

const db = env.DB;
const run = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds).run();

// 2026-10-15 is a Thursday; Dhaka is UTC+6. 09:00 open, 14:00 cutoff.
const OPEN = '2026-10-15T05:00:00Z'; // 11:00 Dhaka
const AFTER = '2026-10-15T09:00:00Z'; // 15:00 Dhaka
const SATURDAY_AFTER = '2026-10-17T09:00:00Z';
const DAY = '2026-10-15';

const get = async (now: string, query = '') => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  const res = await onRequestGet({ request: new Request(`https://x.test/api/state${query}`), env } as never);
  expect(res.status).toBe(200);
  return { text: await res.clone().text(), body: (await res.json()) as any };
};

// Employees 1..3 with distinctive names, snacks 1..2 approved + 3 pending.
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM results'),
    db.prepare('DELETE FROM votes'),
    db.prepare('DELETE FROM snacks'),
    db.prepare('DELETE FROM employees'),
    db.prepare(`UPDATE settings SET open_time = '09:00', cutoff_time = '14:00', working_days = '1,2,3,4,5'`),
    db.prepare(`INSERT INTO employees (id, name) VALUES (1,'Zorblax'),(2,'Quimby'),(3,'Wexford')`),
    db.prepare(`INSERT INTO snacks (id, name, status) VALUES (1,'Samosa','approved'),(2,'Singara','approved'),(3,'Puri','pending')`),
  ]);
});
afterEach(() => vi.useRealTimers());

const vote = (employee: number, snack: number) =>
  run('INSERT INTO votes (day, employee_id, snack_id) VALUES (?, ?, ?)', DAY, employee, snack);

describe('GET /api/state while open', () => {
  it('returns status, window, approved snacks with counts (0 where none) and the leader', async () => {
    await vote(1, 2);
    await vote(2, 2);
    const { body } = await get(OPEN);
    expect(body).toMatchObject({
      status: 'open',
      window: { open_time: '09:00', cutoff_time: '14:00' },
      leader: 2,
      result: null,
      no_snacks: false,
      no_employees: false,
    });
    expect(body.snacks).toEqual([
      { id: 1, name: 'Samosa', count: 0 },
      { id: 2, name: 'Singara', count: 2 },
    ]);
  });

  it('has a null leader when nobody voted', async () => {
    expect((await get(OPEN)).body.leader).toBeNull();
  });

  it('returns my_vote for ?employee=<id>, else null', async () => {
    await vote(1, 1);
    expect((await get(OPEN, '?employee=1')).body.my_vote).toBe(1);
    expect((await get(OPEN, '?employee=2')).body.my_vote).toBeNull();
    expect((await get(OPEN)).body.my_vote).toBeNull();
    expect((await get(OPEN, '?employee=abc')).body.my_vote).toBeNull();
  });

  it('never exposes who voted for what', async () => {
    await vote(1, 1);
    await vote(2, 2);
    const { text } = await get(OPEN, '?employee=1');
    for (const name of ['Zorblax', 'Quimby', 'Wexford']) expect(text).not.toContain(name);
    expect(text).not.toMatch(/employee|voter/i);
  });
});

describe('GET /api/state after cutoff', () => {
  it('decides on the first call, stores the result, and later calls are identical including method', async () => {
    await vote(1, 1);
    await vote(2, 2);
    await vote(3, 1);
    const first = await get(AFTER);
    expect(first.body.status).toBe('decided');
    expect(first.body.result).toMatchObject({ winner: { id: 1, name: 'Samosa' }, method: 'votes' });
    expect(first.body.result.counts).toEqual(
      expect.arrayContaining([
        { snack_id: 1, name: 'Samosa', count: 2 },
        { snack_id: 2, name: 'Singara', count: 1 },
      ]),
    );
    expect((await db.prepare('SELECT * FROM results').all()).results).toHaveLength(1);
    await vote(2, 1); // late write must not change anything
    expect((await get(AFTER)).text).toBe(first.text);
  });

  it('keeps the same random winner and method on a tie', async () => {
    await vote(1, 1);
    await vote(2, 2);
    const first = await get(AFTER);
    expect(first.body.result.method).toBe('tie_random');
    expect([1, 2]).toContain(first.body.result.winner.id);
    expect((await get(AFTER)).text).toBe(first.text);
  });

  it('reports no_votes with a null winner', async () => {
    const { body } = await get(AFTER);
    expect(body.status).toBe('decided');
    expect(body.result).toMatchObject({ winner: null, method: 'no_votes', counts: [] });
  });

  it('decides nothing on a non-working day', async () => {
    const { body } = await get(SATURDAY_AFTER);
    expect(body.status).toBe('closed');
    expect(body.result).toBeNull();
    expect((await db.prepare('SELECT * FROM results').all()).results).toHaveLength(0);
  });

  it('does not decide before cutoff', async () => {
    await get(OPEN);
    expect((await db.prepare('SELECT * FROM results').all()).results).toHaveLength(0);
  });
});

describe('GET /api/state special days', () => {
  it('returns status skipped for a skipped day and leaves it alone', async () => {
    await vote(1, 1);
    await run(`INSERT INTO results (day, status, method) VALUES (?, 'skipped', 'admin')`, DAY);
    const { body } = await get(AFTER);
    expect(body.status).toBe('skipped');
    expect((await db.prepare('SELECT status FROM results').all()).results).toEqual([{ status: 'skipped' }]);
  });

  it('flags no approved snacks and no active employees', async () => {
    await db.batch([db.prepare('DELETE FROM snacks'), db.prepare('UPDATE employees SET active = 0')]);
    const { body } = await get(OPEN);
    expect(body).toMatchObject({ no_snacks: true, no_employees: true, snacks: [], leader: null });
  });
});
