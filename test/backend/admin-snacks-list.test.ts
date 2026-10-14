import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet as listSuggestions } from '../../functions/api/admin/suggestions';
import { onRequestGet as listSnacks, onRequestPost as addSnack } from '../../functions/api/admin/snacks/index';

const DB = env.DB;

async function call(handler: any, body?: unknown) {
  const request = new Request('https://x.test/api/admin/x', {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res: Response = await handler({ request, env });
  return { res, data: (await res.json()) as any };
}

beforeEach(async () => {
  await DB.batch([
    DB.prepare('DELETE FROM votes'),
    DB.prepare('DELETE FROM snacks'),
    DB.prepare('DELETE FROM employees'),
    DB.prepare("INSERT INTO employees (id, name, active) VALUES (1, 'Ann', 1)"),
    DB.prepare(
      "INSERT INTO snacks (name, status, suggested_by) VALUES ('Samosa', 'pending', 1), ('Chips', 'approved', NULL), ('Gum', 'retired', NULL)",
    ),
  ]);
});

describe('GET /api/admin/suggestions', () => {
  it('returns only pending snacks with the suggester name', async () => {
    const { res, data } = await call(listSuggestions);
    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ name: 'Samosa', status: 'pending', suggested_by_name: 'Ann' });
  });
});

describe('GET /api/admin/snacks', () => {
  it('returns every snack with its status', async () => {
    const { res, data } = await call(listSnacks);
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(data.map((s: any) => [s.name, s.status]));
    expect(byName).toEqual({ Samosa: 'pending', Chips: 'approved', Gum: 'retired' });
  });
});

describe('POST /api/admin/snacks', () => {
  it('creates an approved snack (201), trimmed, visible in the approved list', async () => {
    const { res, data } = await call(addSnack, { name: '  Biscuit  ' });
    expect(res.status).toBe(201);
    expect(data).toMatchObject({ name: 'Biscuit', status: 'approved' });
    const row = await DB.prepare("SELECT status FROM snacks WHERE name = 'Biscuit'").first();
    expect(row).toEqual({ status: 'approved' });
    const list = await call(listSnacks);
    expect(list.data.find((s: any) => s.name === 'Biscuit').status).toBe('approved');
  });

  it('409 on a case-insensitive duplicate', async () => {
    const { res, data } = await call(addSnack, { name: 'CHIPS' });
    expect(res.status).toBe(409);
    expect(data.error.code).toBeTruthy();
  });

  it('400 on an invalid body', async () => {
    expect((await call(addSnack, '{nope')).res.status).toBe(400);
    expect((await call(addSnack, {})).res.status).toBe(400);
    expect((await call(addSnack, { name: 5 })).res.status).toBe(400);
    expect((await call(addSnack, { name: '   ' })).res.status).toBe(400);
    expect((await call(addSnack, { name: 'a'.repeat(61) })).res.status).toBe(400);
    expect((await call(addSnack, { name: 'a'.repeat(60) })).res.status).toBe(201);
  });
});
