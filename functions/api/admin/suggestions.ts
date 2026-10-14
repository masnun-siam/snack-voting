import type { Env } from '../../_lib/env';
import { json } from '../../_lib/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.name, s.status, s.suggested_by, e.name AS suggested_by_name, s.created_at
     FROM snacks s LEFT JOIN employees e ON e.id = s.suggested_by
     WHERE s.status = 'pending' ORDER BY s.created_at, s.id`,
  ).all();
  return json(results);
};
