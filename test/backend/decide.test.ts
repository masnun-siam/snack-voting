import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { countVotes } from '../../functions/_lib/counts';
import { decideDay } from '../../functions/_lib/decide';

const db = env.DB;
const DAY = '2026-10-15';
const run = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds).run();
const resultRows = async () => (await db.prepare('SELECT * FROM results').all()).results;
const byId = <T extends { snack_id: number }>(rows: T[]) => [...rows].sort((a, b) => a.snack_id - b.snack_id);

// Employees 1..6 (6 is deactivated), snacks 1..3. `vote(employee, snack)` for DAY.
beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM results'),
    db.prepare('DELETE FROM votes'),
    db.prepare('DELETE FROM snacks'),
    db.prepare('DELETE FROM employees'),
    db.prepare(`INSERT INTO employees (id, name, active) VALUES (1,'A',1),(2,'B',1),(3,'C',1),(4,'D',1),(5,'E',1),(6,'F',0)`),
    db.prepare(`INSERT INTO snacks (id, name, status) VALUES (1,'Samosa','approved'),(2,'Singara','approved'),(3,'Puri','approved')`),
  ]);
});

const vote = (employee: number, snack: number, day = DAY) =>
  run('INSERT INTO votes (day, employee_id, snack_id) VALUES (?, ?, ?)', day, employee, snack);

describe('countVotes', () => {
  it('counts per snack for the day, including deactivated voters, with no voter id', async () => {
    await vote(1, 1);
    await vote(2, 1);
    await vote(6, 2); // deactivated employee
    await vote(3, 3, '2026-10-14'); // other day
    const rows = await countVotes(db, DAY);
    expect(byId(rows)).toEqual([
      { snack_id: 1, name: 'Samosa', count: 2 },
      { snack_id: 2, name: 'Singara', count: 1 },
    ]);
  });
  it('is empty when nobody voted', async () => {
    expect(await countVotes(db, DAY)).toEqual([]);
  });
});

describe('decideDay', () => {
  it('picks the clear winner with method votes and stores counts', async () => {
    await vote(1, 2);
    await vote(2, 2);
    await vote(3, 1);
    const r = await decideDay(db, DAY);
    expect(r).toMatchObject({ day: DAY, status: 'decided', winner_snack_id: 2, method: 'votes' });
    expect(JSON.parse(r.counts)).toEqual({ Samosa: 1, Singara: 2 });
  });

  it('breaks a 2-way tie at random among the tied snacks', async () => {
    await vote(1, 1);
    await vote(2, 1);
    await vote(3, 2);
    await vote(4, 2);
    await vote(5, 3);
    const r = await decideDay(db, DAY);
    expect(r.method).toBe('tie_random');
    expect([1, 2]).toContain(r.winner_snack_id);
  });

  it('breaks a 3-way tie among all three', async () => {
    await vote(1, 1);
    await vote(2, 2);
    await vote(3, 3);
    const r = await decideDay(db, DAY);
    expect(r.method).toBe('tie_random');
    expect([1, 2, 3]).toContain(r.winner_snack_id);
  });

  it('records no_votes with a null winner and empty counts when nobody voted', async () => {
    const r = await decideDay(db, DAY);
    expect(r).toMatchObject({ status: 'decided', winner_snack_id: null, method: 'no_votes' });
    expect(JSON.parse(r.counts)).toEqual({});
  });

  it('counts a deactivated employee vote', async () => {
    await vote(6, 3);
    const r = await decideDay(db, DAY);
    expect(r).toMatchObject({ winner_snack_id: 3, method: 'votes' });
  });

  it('is idempotent: a second call returns the same row and later votes change nothing', async () => {
    await vote(1, 1);
    const first = await decideDay(db, DAY);
    await vote(2, 2);
    await vote(3, 2);
    const second = await decideDay(db, DAY);
    expect(second).toEqual(first);
    expect(await resultRows()).toHaveLength(1);
  });

  it('concurrent calls on a tie produce one row and one winner', async () => {
    await vote(1, 1);
    await vote(2, 2);
    await vote(3, 3);
    const rs = await Promise.all(Array.from({ length: 8 }, () => decideDay(db, DAY)));
    expect(await resultRows()).toHaveLength(1);
    expect(new Set(rs.map((r) => r.winner_snack_id)).size).toBe(1);
    expect(new Set(rs.map((r) => r.counts)).size).toBe(1);
  });

  it('never touches a skipped day', async () => {
    await vote(1, 1);
    await run(`INSERT INTO results (day, status, method) VALUES (?, 'skipped', 'admin')`, DAY);
    const r = await decideDay(db, DAY);
    expect(r).toMatchObject({ status: 'skipped', winner_snack_id: null, method: 'admin' });
    expect(await resultRows()).toHaveLength(1);
  });
});
