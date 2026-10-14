import type { Env } from '../../../_lib/env';
import { error, json, readJsonObject } from '../../../_lib/http';

const MAX_NAME = 60;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.name, s.status, s.suggested_by, e.name AS suggested_by_name, s.created_at
     FROM snacks s LEFT JOIN employees e ON e.id = s.suggested_by
     ORDER BY s.name`,
  ).all();
  return json(results);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const rawName = parsed.body.name;

  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (name.length < 1 || name.length > MAX_NAME) {
    return error(400, 'invalid_name', `name must be 1-${MAX_NAME} characters`);
  }

  try {
    const snack = await env.DB.prepare(
      "INSERT INTO snacks (name, status) VALUES (?, 'approved') RETURNING id, name, status, suggested_by",
    )
      .bind(name)
      .first();
    return json(snack, 201);
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return error(409, 'duplicate', 'A snack with that name already exists');
    }
    throw e;
  }
};
