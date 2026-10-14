import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet } from '../../functions/api/employees';

const get = () =>
  (onRequestGet as unknown as (ctx: { env: typeof env }) => Promise<Response>)({ env });
const run = (sql: string, ...binds: unknown[]) => env.DB.prepare(sql).bind(...binds).run();

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM votes'),
    env.DB.prepare('DELETE FROM employees'),
  ]);
});

describe('GET /api/employees', () => {
  it('returns [] with 200 when there are no employees', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual([]);
  });

  it('returns only active employees', async () => {
    await run(`INSERT INTO employees (name, active) VALUES ('Alice', 1), ('Gone', 0)`);
    const body = (await (await get()).json()) as { name: string }[];
    expect(body.map((e) => e.name)).toEqual(['Alice']);
  });

  it('sorts by name case-insensitively', async () => {
    await run(`INSERT INTO employees (name) VALUES ('charlie'), ('Alice'), ('bob'), ('Dave')`);
    const body = (await (await get()).json()) as { name: string }[];
    expect(body.map((e) => e.name)).toEqual(['Alice', 'bob', 'charlie', 'Dave']);
  });

  it('returns exactly {id, name} with no vote or other data', async () => {
    await run(`INSERT INTO employees (name) VALUES ('Alice')`);
    await run(`INSERT INTO snacks (name) VALUES ('Tea')`);
    const emp = await env.DB.prepare(`SELECT id FROM employees WHERE name = 'Alice'`).first<{ id: number }>();
    await run(`INSERT INTO votes (day, employee_id, snack_id) VALUES ('2026-01-05', ?, 1)`, emp!.id);
    const body = (await (await get()).json()) as Record<string, unknown>[];
    expect(body).toEqual([{ id: emp!.id, name: 'Alice' }]);
    expect(Object.keys(body[0]).sort()).toEqual(['id', 'name']);
  });
});
