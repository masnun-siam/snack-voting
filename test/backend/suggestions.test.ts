import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestPost } from '../../functions/api/suggestions';

const DB = env.DB;

async function suggest(body: unknown) {
  const request = new Request('https://x.test/api/suggestions', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  // @ts-expect-error minimal Pages context
  const res: Response = await onRequestPost({ request, env });
  return { res, data: (await res.json()) as any };
}

const count = async (sql: string) => (await DB.prepare(sql).first<{ n: number }>())!.n;

beforeEach(async () => {
  await DB.batch([
    DB.prepare('DELETE FROM votes'),
    DB.prepare('DELETE FROM snacks'),
    DB.prepare('DELETE FROM employees'),
    DB.prepare("INSERT INTO employees (id, name, active) VALUES (1, 'Ann', 1), (2, 'Bob', 0)"),
  ]);
});

describe('POST /api/suggestions', () => {
  it('creates a pending snack with suggested_by (201)', async () => {
    const { res, data } = await suggest({ employee_id: 1, name: 'Samosa' });
    expect(res.status).toBe(201);
    expect(data).toMatchObject({ name: 'Samosa', status: 'pending', suggested_by: 1 });
    expect(typeof data.id).toBe('number');
    const row = await DB.prepare('SELECT name, status, suggested_by FROM snacks').first();
    expect(row).toEqual({ name: 'Samosa', status: 'pending', suggested_by: 1 });
  });

  it('trims the name', async () => {
    const { res, data } = await suggest({ employee_id: 1, name: '  Samosa  ' });
    expect(res.status).toBe(201);
    expect(data.name).toBe('Samosa');
  });

  it('accepts 60 characters and rejects 0 and 61', async () => {
    expect((await suggest({ employee_id: 1, name: 'a'.repeat(60) })).res.status).toBe(201);
    expect((await suggest({ employee_id: 1, name: '   ' })).res.status).toBe(400);
    expect((await suggest({ employee_id: 1, name: 'a'.repeat(61) })).res.status).toBe(400);
    expect((await suggest({ employee_id: 1 })).res.status).toBe(400);
    expect(await count('SELECT COUNT(*) AS n FROM snacks')).toBe(1);
  });

  it('rejects invalid JSON and a bad employee_id with 400', async () => {
    expect((await suggest('{nope')).res.status).toBe(400);
    expect((await suggest({ name: 'Samosa' })).res.status).toBe(400);
    expect((await suggest({ employee_id: 'x', name: 'Samosa' })).res.status).toBe(400);
  });

  it('409 on a duplicate of an approved snack in other case', async () => {
    await DB.prepare("INSERT INTO snacks (name, status) VALUES ('Samosa', 'approved')").run();
    const { res, data } = await suggest({ employee_id: 1, name: 'SAMOSA' });
    expect(res.status).toBe(409);
    expect(data.error.code).toBeTruthy();
    expect(await count('SELECT COUNT(*) AS n FROM snacks')).toBe(1);
  });

  it('409 on a duplicate of a pending snack in other case', async () => {
    expect((await suggest({ employee_id: 1, name: 'Samosa' })).res.status).toBe(201);
    expect((await suggest({ employee_id: 1, name: 'samosa' })).res.status).toBe(409);
  });

  it('429 on a fourth pending suggestion; only pending rows count', async () => {
    for (const n of ['A', 'B', 'C']) expect((await suggest({ employee_id: 1, name: n })).res.status).toBe(201);
    const { res, data } = await suggest({ employee_id: 1, name: 'D' });
    expect(res.status).toBe(429);
    expect(data.error.code).toBeTruthy();
    await DB.prepare("UPDATE snacks SET status = 'approved' WHERE name = 'A'").run();
    expect((await suggest({ employee_id: 1, name: 'D' })).res.status).toBe(201);
  });

  it('404 for an unknown or inactive employee', async () => {
    expect((await suggest({ employee_id: 99, name: 'Samosa' })).res.status).toBe(404);
    expect((await suggest({ employee_id: 2, name: 'Samosa' })).res.status).toBe(404);
    expect(await count('SELECT COUNT(*) AS n FROM snacks')).toBe(0);
  });

  it('a new suggestion is not in the approved list', async () => {
    await suggest({ employee_id: 1, name: 'Samosa' });
    expect(await count("SELECT COUNT(*) AS n FROM snacks WHERE status = 'approved'")).toBe(0);
  });
});
