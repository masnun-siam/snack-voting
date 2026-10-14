import type { Env } from '../_lib/env';
import { json } from '../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    'SELECT id, name FROM employees WHERE active = 1 ORDER BY name COLLATE NOCASE',
  ).all<{ id: number; name: string }>();
  return json(results);
};
