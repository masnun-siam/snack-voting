import { describe, expect, it, vi } from 'vitest';
import { pinMatches } from '../../functions/_lib/auth';
import { onRequest } from '../../functions/api/admin/_middleware';

describe('pinMatches', () => {
  it('accepts an equal PIN', async () => {
    expect(await pinMatches('1234', '1234')).toBe(true);
  });
  it('rejects a wrong PIN', async () => {
    expect(await pinMatches('1235', '1234')).toBe(false);
  });
  it('rejects null and empty given values', async () => {
    expect(await pinMatches(null, '1234')).toBe(false);
    expect(await pinMatches('', '1234')).toBe(false);
  });
  it('rejects different lengths without throwing', async () => {
    expect(await pinMatches('12345678', '1234')).toBe(false);
    expect(await pinMatches('12', '1234')).toBe(false);
  });
  it('fails closed when the secret is unset or empty', async () => {
    expect(await pinMatches('1234', undefined)).toBe(false);
    expect(await pinMatches('', '')).toBe(false);
    expect(await pinMatches(null, undefined)).toBe(false);
  });
});

function run(env: { ADMIN_PIN?: string }, headers: Record<string, string> = {}) {
  const next = vi.fn(async () => new Response('route'));
  const context = {
    request: new Request('https://x.test/api/admin/anything', { headers }),
    env,
    next,
  } as unknown as Parameters<typeof onRequest>[0];
  return { next, res: Promise.resolve(onRequest(context)) as Promise<Response> };
}

async function expectUnauthorized(r: ReturnType<typeof run>) {
  const res = await r.res;
  expect(res.status).toBe(401);
  expect(res.headers.get('content-type')).toContain('application/json');
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe('unauthorized');
  expect(typeof body.error.message).toBe('string');
  expect(r.next).not.toHaveBeenCalled();
}

describe('admin middleware', () => {
  it('401s when the header is missing', async () => {
    await expectUnauthorized(run({ ADMIN_PIN: '1234' }));
  });
  it('401s when the header is empty', async () => {
    await expectUnauthorized(run({ ADMIN_PIN: '1234' }, { 'x-admin-pin': '' }));
  });
  it('401s when the PIN is wrong', async () => {
    await expectUnauthorized(run({ ADMIN_PIN: '1234' }, { 'x-admin-pin': '0000' }));
  });
  it('passes through to next() with the correct PIN', async () => {
    const r = run({ ADMIN_PIN: '1234' }, { 'X-Admin-Pin': '1234' });
    const res = await r.res;
    expect(r.next).toHaveBeenCalledTimes(1);
    expect(await res.text()).toBe('route');
  });
  it('rejects everything when ADMIN_PIN is unset', async () => {
    await expectUnauthorized(run({}, { 'x-admin-pin': '1234' }));
    await expectUnauthorized(run({}, { 'x-admin-pin': '' }));
    await expectUnauthorized(run({}));
  });
});
