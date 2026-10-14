import type { Env } from '../_lib/env';
import { error, json, readJsonObject } from '../_lib/http';

const MAX_NAME = 60;
const MAX_PENDING = 3;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { employee_id, name: rawName } = parsed.body;

  if (!Number.isInteger(employee_id)) {
    return error(400, 'invalid_employee_id', 'employee_id must be an integer');
  }
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (name.length < 1 || name.length > MAX_NAME) {
    return error(400, 'invalid_name', `name must be 1-${MAX_NAME} characters`);
  }

  const employee = await env.DB.prepare('SELECT id FROM employees WHERE id = ? AND active = 1')
    .bind(employee_id)
    .first();
  if (!employee) return error(404, 'employee_not_found', 'Employee not found');

  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM snacks WHERE status = 'pending' AND suggested_by = ?",
  )
    .bind(employee_id)
    .first<{ n: number }>();
  if (pending!.n >= MAX_PENDING) {
    return error(429, 'too_many_pending', `You already have ${MAX_PENDING} pending suggestions`);
  }

  try {
    const snack = await env.DB.prepare(
      "INSERT INTO snacks (name, status, suggested_by) VALUES (?, 'pending', ?) RETURNING id, name, status, suggested_by",
    )
      .bind(name, employee_id)
      .first();
    return json(snack, 201);
  } catch (e) {
    // ponytail: unique violation decides duplicates (race-safe); no pre-check
    if (String(e).includes('UNIQUE')) {
      return error(409, 'duplicate', 'A snack with that name already exists');
    }
    throw e;
  }
};
