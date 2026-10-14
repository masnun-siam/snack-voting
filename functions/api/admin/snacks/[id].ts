import type { Env } from '../../../_lib/env';
import { error, json, readJsonObject } from '../../../_lib/http';

const MAX_NAME = 60;

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return error(404, 'snack_not_found', 'Snack not found');

  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { name: rawName, status } = parsed.body;

  if (rawName === undefined && status === undefined) {
    return error(400, 'empty_update', 'Provide name and/or status');
  }
  if (status !== undefined && status !== 'approved' && status !== 'retired') {
    return error(400, 'invalid_status', "status must be 'approved' or 'retired'");
  }
  let name: string | undefined;
  if (rawName !== undefined) {
    name = typeof rawName === 'string' ? rawName.trim() : '';
    if (name.length < 1 || name.length > MAX_NAME) {
      return error(400, 'invalid_name', `name must be 1-${MAX_NAME} characters`);
    }
  }

  try {
    // Rows are never deleted; COALESCE leaves an omitted field unchanged.
    const snack = await env.DB.prepare(
      'UPDATE snacks SET name = COALESCE(?, name), status = COALESCE(?, status) WHERE id = ? RETURNING id, name, status, suggested_by',
    )
      .bind(name ?? null, status ?? null, id)
      .first();
    if (!snack) return error(404, 'snack_not_found', 'Snack not found');
    return json(snack);
  } catch (e) {
    // ponytail: unique violation decides duplicates (race-safe); no pre-check
    if (String(e).includes('UNIQUE')) {
      return error(409, 'duplicate', 'A snack with that name already exists');
    }
    throw e;
  }
};
