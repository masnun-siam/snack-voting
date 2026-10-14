import type { Env } from '../../../_lib/env';
import { error, json, readJsonObject } from '../../../_lib/http';

const MAX_NAME = 60;
const badName = () => error(400, 'invalid_name', `name must be 1-${MAX_NAME} characters`);

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    'SELECT id, name, active FROM employees ORDER BY name',
  ).all();
  return json({ employees: results });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { names, name } = parsed.body;

  if (names !== undefined) {
    if (!Array.isArray(names) || !names.every((n) => typeof n === 'string')) {
      return error(400, 'invalid_names', 'names must be an array of strings');
    }
    // blanks are dropped (not counted); existing and repeated names count as skipped
    const clean = names.map((n: string) => n.trim()).filter(Boolean);
    if (clean.some((n) => n.length > MAX_NAME)) return badName();
    const results = await env.DB.batch(
      clean.map((n) => env.DB.prepare('INSERT OR IGNORE INTO employees (name) VALUES (?)').bind(n)),
    );
    const created = results.reduce((sum, r) => sum + r.meta.changes, 0);
    return json({ created, skipped: clean.length - created });
  }

  const single = typeof name === 'string' ? name.trim() : '';
  if (single.length < 1 || single.length > MAX_NAME) return badName();
  try {
    const row = await env.DB.prepare(
      'INSERT INTO employees (name) VALUES (?) RETURNING id, name, active',
    )
      .bind(single)
      .first();
    return json(row, 201);
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return error(409, 'duplicate', 'An employee with that name already exists');
    }
    throw e;
  }
};
