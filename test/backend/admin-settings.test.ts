import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { onRequestGet, onRequestPut } from '../../functions/api/admin/settings';
import { getDayState } from '../../functions/_lib/day';

const DB = env.DB;

async function get() {
  // @ts-expect-error minimal Pages context
  const res: Response = await onRequestGet({ request: new Request('https://x.test/api/admin/settings'), env });
  return { res, data: (await res.json()) as any };
}

async function put(body: unknown) {
  const request = new Request('https://x.test/api/admin/settings', {
    method: 'PUT',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  // @ts-expect-error minimal Pages context
  const res: Response = await onRequestPut({ request, env });
  return { res, data: (await res.json()) as any };
}

const valid = { open_time: '09:00', cutoff_time: '14:00', working_days: [1, 2, 3, 4, 5] };

beforeEach(async () => {
  await DB.batch([
    DB.prepare('DELETE FROM results'),
    DB.prepare("UPDATE settings SET open_time = '09:00', cutoff_time = '14:00', working_days = '1,2,3,4,5' WHERE id = 1"),
  ]);
});

describe('GET /api/admin/settings', () => {
  it('returns the seeded settings with working_days as numbers', async () => {
    const { res, data } = await get();
    expect(res.status).toBe(200);
    expect(data).toEqual(valid);
  });
});

describe('PUT /api/admin/settings', () => {
  it('stores times and working days and GET returns them', async () => {
    const next = { open_time: '08:30', cutoff_time: '15:45', working_days: [7, 1, 3] };
    const { res, data } = await put(next);
    expect(res.status).toBe(200);
    expect(data).toEqual({ open_time: '08:30', cutoff_time: '15:45', working_days: [1, 3, 7] });
    expect((await get()).data).toEqual({ open_time: '08:30', cutoff_time: '15:45', working_days: [1, 3, 7] });
    const row = await DB.prepare('SELECT working_days FROM settings WHERE id = 1').first<{ working_days: string }>();
    expect(row!.working_days).toBe('1,3,7');
  });

  it('rejects cutoff equal to or before open with 400 and stores nothing', async () => {
    expect((await put({ ...valid, cutoff_time: '09:00' })).res.status).toBe(400);
    expect((await put({ ...valid, cutoff_time: '08:59' })).res.status).toBe(400);
    expect((await get()).data).toEqual(valid);
  });

  it('rejects malformed or missing times with 400', async () => {
    for (const bad of ['9:00', '24:00', '09:60', 'noon', '', 900, null]) {
      expect((await put({ ...valid, open_time: bad })).res.status).toBe(400);
      expect((await put({ ...valid, cutoff_time: bad })).res.status).toBe(400);
    }
    expect((await put({ cutoff_time: '14:00', working_days: [1] })).res.status).toBe(400);
  });

  it('rejects empty, out-of-range, duplicate, non-integer or non-array working_days with 400', async () => {
    for (const bad of [[], [0], [8], [1, 1], [1.5], ['1'], '1,2', null, undefined]) {
      expect((await put({ ...valid, working_days: bad })).res.status).toBe(400);
    }
    expect((await get()).data).toEqual(valid);
  });

  it('rejects malformed JSON and non-object bodies with 400', async () => {
    expect((await put('{nope')).res.status).toBe(400);
    expect((await put([])).res.status).toBe(400);
  });

  it('a raised cutoff reopens a day immediately for getDayState', async () => {
    // 2026-10-14 is a Wednesday; 15:00 Dhaka = 09:00Z
    const now = new Date('2026-10-14T09:00:00Z');
    expect((await getDayState(DB, now)).status).toBe('closed');
    expect((await put({ ...valid, cutoff_time: '16:00' })).res.status).toBe(200);
    const state = await getDayState(DB, now);
    expect(state.status).toBe('open');
    expect(state.window.cutoff_time).toBe('16:00');
  });
});
