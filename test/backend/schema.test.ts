import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const run = (sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(...binds).run();
const first = <T>(sql: string) => env.DB.prepare(sql).first<T>();

describe('unique case-insensitive names', () => {
  it('rejects employee names differing only by case', async () => {
    await run(`INSERT INTO employees (name) VALUES ('Alice')`);
    await expect(run(`INSERT INTO employees (name) VALUES ('ALICE')`)).rejects.toThrow(/UNIQUE/i);
  });

  it('rejects snack names differing only by case', async () => {
    await run(`INSERT INTO snacks (name) VALUES ('Samosa')`);
    await expect(run(`INSERT INTO snacks (name) VALUES ('sAmOsA')`)).rejects.toThrow(/UNIQUE/i);
  });

  it('keeps employee and snack names independent', async () => {
    await run(`INSERT INTO employees (name) VALUES ('Chips')`);
    await run(`INSERT INTO snacks (name) VALUES ('chips')`);
    expect((await first<{ n: number }>(`SELECT count(*) n FROM snacks WHERE name = 'Chips'`))!.n).toBe(1);
  });
});

describe('votes and results keys', () => {
  it('rejects a second vote for the same (day, employee_id)', async () => {
    await run(`INSERT INTO employees (name) VALUES ('Bob')`);
    await run(`INSERT INTO snacks (name) VALUES ('Tea'), ('Cake')`);
    await run(`INSERT INTO votes (day, employee_id, snack_id) VALUES ('2026-01-05', 1, 1)`);
    await expect(
      run(`INSERT INTO votes (day, employee_id, snack_id) VALUES ('2026-01-05', 1, 2)`),
    ).rejects.toThrow(/UNIQUE|PRIMARY/i);
    // a different day is fine
    await run(`INSERT INTO votes (day, employee_id, snack_id) VALUES ('2026-01-06', 1, 2)`);
  });

  it('rejects a second results row for the same day', async () => {
    await run(`INSERT INTO results (day, status, method) VALUES ('2026-01-05', 'skipped', 'no_votes')`);
    await expect(
      run(`INSERT INTO results (day, status, method) VALUES ('2026-01-05', 'skipped', 'admin')`),
    ).rejects.toThrow(/UNIQUE|PRIMARY/i);
  });
});

describe('CHECK constraints', () => {
  it('snacks.status accepts pending, approved, retired only', async () => {
    for (const [i, s] of ['pending', 'approved', 'retired'].entries()) {
      await run(`INSERT INTO snacks (name, status) VALUES (?, ?)`, `ok${i}`, s);
    }
    await expect(run(`INSERT INTO snacks (name, status) VALUES ('bad', 'deleted')`)).rejects.toThrow(/CHECK/i);
  });

  it('results.status accepts decided, skipped only', async () => {
    await run(`INSERT INTO results (day, status, method) VALUES ('2026-02-02', 'decided', 'votes')`);
    await run(`INSERT INTO results (day, status, method) VALUES ('2026-02-03', 'skipped', 'admin')`);
    await expect(
      run(`INSERT INTO results (day, status, method) VALUES ('2026-02-04', 'pending', 'votes')`),
    ).rejects.toThrow(/CHECK/i);
  });

  it('results.method accepts votes, tie_random, admin, no_votes only', async () => {
    for (const [i, m] of ['votes', 'tie_random', 'admin', 'no_votes'].entries()) {
      await run(`INSERT INTO results (day, status, method) VALUES (?, 'decided', ?)`, `2026-03-0${i + 1}`, m);
    }
    await expect(
      run(`INSERT INTO results (day, status, method) VALUES ('2026-03-09', 'decided', 'coinflip')`),
    ).rejects.toThrow(/CHECK/i);
  });
});

describe('settings', () => {
  it('has exactly one seeded row', async () => {
    const { results } = await env.DB.prepare(`SELECT * FROM settings`).all();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ open_time: '09:00', cutoff_time: '14:00', working_days: '1,2,3,4,5' });
  });

  it('rejects a second settings row', async () => {
    await expect(
      run(`INSERT INTO settings (id, open_time, cutoff_time, working_days) VALUES (2, '08:00', '12:00', '1')`),
    ).rejects.toThrow(/CHECK/i);
    await expect(
      run(`INSERT INTO settings (id, open_time, cutoff_time, working_days) VALUES (1, '08:00', '12:00', '1')`),
    ).rejects.toThrow(/UNIQUE|PRIMARY/i);
  });
});
