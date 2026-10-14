import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestPatch } from '../../functions/api/admin/snacks/[id]';

const DB = env.DB;

async function patch(id: string | number, body: unknown) {
  const request = new Request(`https://x.test/api/admin/snacks/${id}`, {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  // @ts-expect-error minimal Pages context
  const res: Response = await onRequestPatch({ request, env, params: { id: String(id) } });
  return { res, data: (await res.json()) as any };
}

const statusOf = async (id: number) =>
  (await DB.prepare('SELECT status FROM snacks WHERE id = ?').bind(id).first<{ status: string }>())!.status;

beforeEach(async () => {
  await DB.batch([
    DB.prepare('DELETE FROM results'),
    DB.prepare('DELETE FROM votes'),
    DB.prepare('DELETE FROM snacks'),
    DB.prepare("INSERT INTO snacks (id, name, status) VALUES (1, 'Samosa', 'pending'), (2, 'Chips', 'approved'), (3, 'Cake', 'retired')"),
  ]);
});

describe('PATCH /api/admin/snacks/:id', () => {
  it('approves a pending snack so it shows in the approved query', async () => {
    const { res, data } = await patch(1, { status: 'approved' });
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ id: 1, name: 'Samosa', status: 'approved' });
    const { results } = await DB.prepare("SELECT id FROM snacks WHERE status = 'approved' ORDER BY id").all();
    expect(results.map((r: any) => r.id)).toEqual([1, 2]);
  });

  it('rejecting a pending snack and retiring an approved one both give retired', async () => {
    expect((await patch(1, { status: 'retired' })).data.status).toBe('retired');
    expect((await patch(2, { status: 'retired' })).data.status).toBe('retired');
    expect(await statusOf(1)).toBe('retired');
    expect(await statusOf(2)).toBe('retired');
  });

  it('re-approves a retired snack', async () => {
    const { res, data } = await patch(3, { status: 'approved' });
    expect(res.status).toBe(200);
    expect(data.status).toBe('approved');
    expect(await statusOf(3)).toBe('approved');
  });

  it('renames, trimming the name, and leaves status alone', async () => {
    const { res, data } = await patch(2, { name: '  Crisps  ' });
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ id: 2, name: 'Crisps', status: 'approved' });
  });

  it('renames and changes status in one request', async () => {
    const { data } = await patch(1, { name: 'Singara', status: 'approved' });
    expect(data).toMatchObject({ name: 'Singara', status: 'approved' });
  });

  it('accepts 60 characters and rejects 0 and 61 with 400', async () => {
    expect((await patch(2, { name: 'a'.repeat(60) })).res.status).toBe(200);
    expect((await patch(2, { name: '   ' })).res.status).toBe(400);
    expect((await patch(2, { name: 'a'.repeat(61) })).res.status).toBe(400);
    expect((await patch(2, { name: 5 })).res.status).toBe(400);
  });

  it('409 when renaming to an existing name in other case; row unchanged', async () => {
    const { res, data } = await patch(1, { name: 'CHIPS' });
    expect(res.status).toBe(409);
    expect(data.error.code).toBeTruthy();
    const row = await DB.prepare('SELECT name FROM snacks WHERE id = 1').first();
    expect(row).toEqual({ name: 'Samosa' });
  });

  it('renaming to its own name in other case is allowed', async () => {
    expect((await patch(2, { name: 'chips' })).res.status).toBe(200);
  });

  it('404 for an unknown id and for a non-numeric id', async () => {
    expect((await patch(99, { status: 'approved' })).res.status).toBe(404);
    expect((await patch('abc', { status: 'approved' })).res.status).toBe(404);
  });

  it('400 for an invalid status (pending is not settable)', async () => {
    for (const status of ['pending', 'deleted', 5, null]) {
      expect((await patch(1, { status })).res.status).toBe(400);
    }
    expect(await statusOf(1)).toBe('pending');
  });

  it('400 for an empty body or invalid JSON', async () => {
    expect((await patch(1, {})).res.status).toBe(400);
    expect((await patch(1, '{nope')).res.status).toBe(400);
  });

  it('retiring a snack referenced by a result leaves the result untouched', async () => {
    await DB.prepare(
      "INSERT INTO results (day, status, winner_snack_id, method, counts) VALUES ('2026-01-05', 'decided', 2, 'votes', '{\"2\":3}')",
    ).run();
    expect((await patch(2, { status: 'retired' })).res.status).toBe(200);
    const row = await DB.prepare("SELECT winner_snack_id, counts FROM results WHERE day = '2026-01-05'").first();
    expect(row).toEqual({ winner_snack_id: 2, counts: '{"2":3}' });
    expect(await DB.prepare('SELECT COUNT(*) AS n FROM snacks').first()).toEqual({ n: 3 });
  });
});
