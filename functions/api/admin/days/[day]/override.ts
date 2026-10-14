// POST /api/admin/days/:day/override { snack_id }: replace the winner of a decided day (FR-10).
import type { Env } from '../../../../_lib/env';
import { error, json, readJsonObject } from '../../../../_lib/http';
import { isValidDay } from '../../../../_lib/time';

export const onRequestPost: PagesFunction<Env, 'day'> = async ({ request, env, params }) => {
  const day = String(params.day);
  if (!isValidDay(day)) return error(400, 'invalid_day', 'day must be YYYY-MM-DD');
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { snack_id } = parsed.body;
  if (!Number.isInteger(snack_id)) return error(400, 'invalid_snack_id', 'snack_id must be an integer');

  if (!(await env.DB.prepare('SELECT 1 AS ok FROM snacks WHERE id = ?').bind(snack_id).first())) {
    return error(404, 'snack_not_found', 'Unknown snack');
  }
  // Conditional UPDATE: only a decided row changes, so undecided and skipped days fall through to 409.
  const { meta } = await env.DB.prepare(
    `UPDATE results SET winner_snack_id = ?, method = 'admin' WHERE day = ? AND status = 'decided'`,
  )
    .bind(snack_id, day)
    .run();
  if (!meta.changes) return error(409, 'not_decided', 'Only a decided day can be overridden');
  return json({ day, winner_snack_id: snack_id, method: 'admin' });
};
