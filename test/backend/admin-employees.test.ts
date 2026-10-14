import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPost } from '../../functions/api/admin/employees/index';
import { onRequestPatch } from '../../functions/api/admin/employees/[id]';

const DB = env.DB;

async function call(handler: any, method: string, body?: unknown, params: Record<string, string> = {}) {
  const request = new Request('https://x.test/api/admin/employees', {
    method,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res: Response = await handler({ request, env, params });
  return { res, data: (await res.json()) as any };
}
const list = () => call(onRequestGet, 'GET');
const add = (body: unknown) => call(onRequestPost, 'POST', body);
const patch = (id: string, body: unknown) => call(onRequestPatch, 'PATCH', body, { id });

const names = async () =>
  (await DB.prepare('SELECT name FROM employees ORDER BY id').all<{ name: string }>()).results.map((r) => r.name);

beforeEach(async () => {
  await DB.batch([
    DB.prepare('DELETE FROM votes'),
    DB.prepare('DELETE FROM snacks'),
    DB.prepare('DELETE FROM employees'),
    DB.prepare("INSERT INTO employees (id, name, active) VALUES (1, 'Ann', 1), (2, 'Bob', 0)"),
  ]);
});

describe('GET /admin/employees', () => {
  it('lists all employees including inactive, with active flag', async () => {
    const { res, data } = await list();
    expect(res.status).toBe(200);
    expect(data.employees).toMatchObject([
      { id: 1, name: 'Ann', active: 1 },
      { id: 2, name: 'Bob', active: 0 },
    ]);
  });
});

describe('POST /admin/employees bulk', () => {
  it('trims, skips blanks and existing names (any case), returns counts', async () => {
    const { res, data } = await add({ names: ['  Cara ', '', '   ', 'ANN', 'bob', 'Dan'] });
    expect(res.status).toBe(200);
    expect(data).toEqual({ created: 2, skipped: 2 });
    expect(await names()).toEqual(['Ann', 'Bob', 'Cara', 'Dan']);
  });

  it('skips a name repeated within the same list', async () => {
    const { data } = await add({ names: ['Eve', 'eve'] });
    expect(data).toEqual({ created: 1, skipped: 1 });
  });

  it('accepts 60 chars; 400 for 61 and nothing is created', async () => {
    expect((await add({ names: ['a'.repeat(60)] })).res.status).toBe(200);
    const { res } = await add({ names: ['Fay', 'a'.repeat(61)] });
    expect(res.status).toBe(400);
    expect(await names()).not.toContain('Fay');
  });

  it('400 for bad JSON, missing names, non-string entries', async () => {
    expect((await add('{nope')).res.status).toBe(400);
    expect((await add({})).res.status).toBe(400);
    expect((await add({ names: 'Cara' })).res.status).toBe(400);
    expect((await add({ names: [1] })).res.status).toBe(400);
  });
});

describe('POST /admin/employees single', () => {
  it('creates one employee (201)', async () => {
    const { res, data } = await add({ name: ' Cara ' });
    expect(res.status).toBe(201);
    expect(data).toMatchObject({ name: 'Cara', active: 1 });
    expect(typeof data.id).toBe('number');
  });

  it('409 when the name exists in other case', async () => {
    expect((await add({ name: 'ann' })).res.status).toBe(409);
    expect(await names()).toEqual(['Ann', 'Bob']);
  });

  it('400 for blank or over-length name', async () => {
    expect((await add({ name: '  ' })).res.status).toBe(400);
    expect((await add({ name: 'a'.repeat(61) })).res.status).toBe(400);
  });
});

describe('PATCH /admin/employees/:id', () => {
  it('renames with trim', async () => {
    const { res, data } = await patch('1', { name: '  Annie ' });
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ id: 1, name: 'Annie', active: 1 });
  });

  it('allows a case-only rename of itself', async () => {
    expect((await patch('1', { name: 'ANN' })).res.status).toBe(200);
  });

  it('409 on rename clash in other case; row unchanged', async () => {
    const { res } = await patch('1', { name: 'BOB' });
    expect(res.status).toBe(409);
    expect(await names()).toEqual(['Ann', 'Bob']);
  });

  it('400 for blank, over-length, non-boolean active, empty body, bad id', async () => {
    expect((await patch('1', { name: ' ' })).res.status).toBe(400);
    expect((await patch('1', { name: 'a'.repeat(61) })).res.status).toBe(400);
    expect((await patch('1', { active: 'yes' })).res.status).toBe(400);
    expect((await patch('1', {})).res.status).toBe(400);
    expect((await patch('x', { name: 'Z' })).res.status).toBe(400);
  });

  it('404 for an unknown id', async () => {
    expect((await patch('99', { name: 'Zed' })).res.status).toBe(404);
    expect((await patch('99', { active: false })).res.status).toBe(404);
  });

  it('deactivates without deleting; votes stay; absent from active list; reactivates', async () => {
    await DB.batch([
      DB.prepare("INSERT INTO snacks (id, name, status) VALUES (1, 'Samosa', 'approved')"),
      DB.prepare("INSERT INTO votes (day, employee_id, snack_id) VALUES ('2026-01-05', 1, 1)"),
    ]);
    const { res, data } = await patch('1', { active: false });
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ id: 1, name: 'Ann', active: 0 });

    expect(await DB.prepare('SELECT COUNT(*) AS n FROM employees WHERE id = 1').first('n')).toBe(1);
    expect(await DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE employee_id = 1').first('n')).toBe(1);
    // ponytail: voter GET /employees (task 6) is not on this branch; the active list is its query
    const active = await DB.prepare('SELECT name FROM employees WHERE active = 1').all();
    expect(active.results).toEqual([]);
    expect((await list()).data.employees.find((e: any) => e.id === 1).active).toBe(0);

    expect((await patch('1', { active: true })).data.active).toBe(1);
  });

  it('renames and deactivates in one request', async () => {
    const { data } = await patch('1', { name: 'Annie', active: false });
    expect(data).toMatchObject({ name: 'Annie', active: 0 });
  });
});
