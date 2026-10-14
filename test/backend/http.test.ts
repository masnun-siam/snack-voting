import { describe, expect, it } from 'vitest';
import { error, json, readJsonObject } from '../../functions/_lib/http';

const post = (body: BodyInit | null) => new Request('https://x.test/api', { method: 'POST', body });

describe('json', () => {
  it('defaults to 200 with a JSON content type', async () => {
    const res = json({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('uses the given status', () => {
    expect(json({ ok: true }, 201).status).toBe(201);
  });
});

describe('error', () => {
  it('returns {error:{code,message}} with the given status', async () => {
    const res = error(409, 'conflict', 'already voted');
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: { code: 'conflict', message: 'already voted' } });
  });
});

describe('readJsonObject', () => {
  it('returns ok with the parsed object', async () => {
    const r = await readJsonObject(post('{"name":"Ann","n":2}'));
    expect(r).toEqual({ ok: true, body: { name: 'Ann', n: 2 } });
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['empty body', ''],
    ['an array', '[1,2]'],
    ['null', 'null'],
    ['a string', '"hi"'],
    ['a number', '42'],
    ['a boolean', 'true'],
  ])('rejects %s with 400 invalid_json', async (_name, raw) => {
    const r = await readJsonObject(post(raw));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.response.status).toBe(400);
    const body = (await r.response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('invalid_json');
    expect(typeof body.error.message).toBe('string');
  });

  it('rejects a missing body without throwing', async () => {
    const r = await readJsonObject(new Request('https://x.test/api'));
    expect(r.ok).toBe(false);
  });
});
