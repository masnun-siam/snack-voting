import type { Env } from '../../../_lib/env';
import { error, json, readJsonObject } from '../../../_lib/http';

const MAX_NAME = 60;

export const onRequestPatch: PagesFunction<Env, 'id'> = async ({ request, env, params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error(400, 'invalid_id', 'id must be an integer');

  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { name, active } = parsed.body;

  if (name === undefined && active === undefined) {
    return error(400, 'nothing_to_update', 'Provide name and/or active');
  }
  let newName: string | null = null;
  if (name !== undefined) {
    newName = typeof name === 'string' ? name.trim() : '';
    if (newName.length < 1 || newName.length > MAX_NAME) {
      return error(400, 'invalid_name', `name must be 1-${MAX_NAME} characters`);
    }
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return error(400, 'invalid_active', 'active must be a boolean');
  }

  try {
    const row = await env.DB.prepare(
      'UPDATE employees SET name = COALESCE(?, name), active = COALESCE(?, active) WHERE id = ? RETURNING id, name, active',
    )
      .bind(newName, active === undefined ? null : active ? 1 : 0, id)
      .first();
    return row ? json(row) : error(404, 'employee_not_found', 'Employee not found');
  } catch (e) {
    // ponytail: unique violation decides rename clashes (race-safe); no pre-check
    if (String(e).includes('UNIQUE')) {
      return error(409, 'duplicate', 'An employee with that name already exists');
    }
    throw e;
  }
};
