// POST /api/vote { employee_id, snack_id }: one vote per employee per day, changeable until cutoff (FR-2, FR-3).
import { getDayState } from '../_lib/day';
import type { Env } from '../_lib/env';
import { error, json, readJsonObject } from '../_lib/http';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { employee_id, snack_id } = parsed.body;
  if (!Number.isInteger(employee_id) || !Number.isInteger(snack_id)) {
    return error(400, 'invalid_ids', 'employee_id and snack_id must be integers');
  }

  const state = await getDayState(env.DB, new Date());
  if (state.status !== 'open') {
    const { open_time, cutoff_time } = state.window;
    const message =
      state.status === 'skipped'
        ? 'Voting is skipped today'
        : state.status === 'decided'
          ? "Voting is closed: today's snack has been decided"
          : `Voting is closed. It opens at ${open_time} and closes at ${cutoff_time} on working days`;
    return error(403, 'voting_closed', message);
  }

  const [employee, snack] = await Promise.all([
    env.DB.prepare('SELECT 1 AS ok FROM employees WHERE id = ? AND active = 1').bind(employee_id).first(),
    env.DB.prepare(`SELECT 1 AS ok FROM snacks WHERE id = ? AND status = 'approved'`).bind(snack_id).first(),
  ]);
  if (!employee) return error(404, 'employee_not_found', 'Unknown or inactive employee');
  if (!snack) return error(409, 'snack_not_votable', 'That snack is not available for voting');

  // The (day, employee_id) primary key is what keeps this to one row under concurrency.
  await env.DB.prepare(
    `INSERT INTO votes (day, employee_id, snack_id, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (day, employee_id) DO UPDATE SET snack_id = excluded.snack_id, updated_at = excluded.updated_at`,
  )
    .bind(state.day, employee_id, snack_id, new Date().toISOString())
    .run();
  return json({ ok: true });
};
