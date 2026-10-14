import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet } from '../../functions/api/history';

const db = env.DB;
const run = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds).run();

type Entry = { day: string; winner: string | null; counts: Record<string, number>; method: string };
const get = async () => {
  const res = await onRequestGet({ env } as unknown as Parameters<typeof onRequestGet>[0]);
  expect(res.status).toBe(200);
  const text = await res.text();
  return { text, body: JSON.parse(text) as Entry[] };
};
const result = (day: string, status: string, winner: number | null, method: string, counts = '{}') =>
  run(`INSERT INTO results (day, status, winner_snack_id, method, counts) VALUES (?, ?, ?, ?, ?)`, day, status, winner, method, counts);

// Storage is shared across tests in a file, so reset the tables these tests touch.
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM results'),
    db.prepare('DELETE FROM votes'),
    db.prepare('DELETE FROM snacks'),
    db.prepare('DELETE FROM employees'),
  ]);
  await run(`INSERT INTO snacks (id, name, status) VALUES (1, 'Samosa', 'approved'), (2, 'Tea', 'approved')`);
});

describe('GET /api/history', () => {
  it('returns an empty list when there are no results', async () => {
    expect((await get()).body).toEqual([]);
  });

  it('lists decided days newest first with winner name, parsed counts and method', async () => {
    await result('2026-01-05', 'decided', 1, 'votes', '{"Samosa":3,"Tea":1}');
    await result('2026-01-07', 'decided', 2, 'tie_random', '{"Samosa":2,"Tea":2}');
    expect((await get()).body).toEqual([
      { day: '2026-01-07', winner: 'Tea', counts: { Samosa: 2, Tea: 2 }, method: 'tie_random' },
      { day: '2026-01-05', winner: 'Samosa', counts: { Samosa: 3, Tea: 1 }, method: 'votes' },
    ]);
  });

  it('caps at the 30 newest days', async () => {
    const days = Array.from({ length: 35 }, (_, i) => new Date(Date.UTC(2026, 3, 1 + i)).toISOString().slice(0, 10));
    for (const day of days) await result(day, 'decided', 1, 'votes');
    const { body } = await get();
    expect(body).toHaveLength(30);
    expect(body.map((e) => e.day)).toEqual(days.slice(5).reverse());
  });

  it('reports a null winner for a no-votes day', async () => {
    await result('2026-03-02', 'decided', null, 'no_votes');
    expect((await get()).body).toEqual([{ day: '2026-03-02', winner: null, counts: {}, method: 'no_votes' }]);
  });

  it('reports method "skipped" for a skipped day', async () => {
    await result('2026-03-03', 'skipped', null, 'admin');
    expect((await get()).body).toEqual([{ day: '2026-03-03', winner: null, counts: {}, method: 'skipped' }]);
  });

  it('keeps the name of a retired winning snack', async () => {
    await result('2026-03-04', 'decided', 1, 'votes', '{"Samosa":2}');
    await run(`UPDATE snacks SET status = 'retired' WHERE id = 1`);
    expect((await get()).body[0]).toMatchObject({ winner: 'Samosa', counts: { Samosa: 2 } });
  });

  it('is unaffected by deactivating an employee', async () => {
    await run(`INSERT INTO employees (id, name) VALUES (1, 'Alice Voter')`);
    await run(`INSERT INTO votes (day, employee_id, snack_id) VALUES ('2026-03-05', 1, 1)`);
    await result('2026-03-05', 'decided', 1, 'votes', '{"Samosa":1}');
    const before = (await get()).body;
    await run(`UPDATE employees SET active = 0 WHERE id = 1`);
    expect((await get()).body).toEqual(before);
  });

  it('does not list a day that has votes but no results row', async () => {
    await run(`INSERT INTO employees (id, name) VALUES (1, 'Bob')`);
    await run(`INSERT INTO votes (day, employee_id, snack_id) VALUES ('2026-03-06', 1, 1)`);
    expect((await get()).body).toEqual([]);
  });

  it('never exposes voter names or ids', async () => {
    await run(`INSERT INTO employees (id, name) VALUES (4242, 'Zebediah Quux')`);
    await run(`INSERT INTO votes (day, employee_id, snack_id) VALUES ('2026-03-09', 4242, 1)`);
    await result('2026-03-09', 'decided', 1, 'votes', '{"Samosa":1}');
    const { text, body } = await get();
    expect(text).not.toContain('Zebediah');
    expect(text).not.toContain('4242');
    expect(Object.keys(body[0]).sort()).toEqual(['counts', 'day', 'method', 'winner']);
  });
});
