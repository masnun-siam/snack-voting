// POST /api/admin/days/:day/skip: no snack today (FR-10). Only today, before cutoff, with no result yet.
import { getSettings } from '../../../../_lib/day';
import type { Env } from '../../../../_lib/env';
import { error, json } from '../../../../_lib/http';
import { dayWindowStatus, dhakaDay, isValidDay } from '../../../../_lib/time';

export const onRequestPost: PagesFunction<Env, 'day'> = async ({ env, params }) => {
  const day = String(params.day);
  if (!isValidDay(day)) return error(400, 'invalid_day', 'day must be YYYY-MM-DD');

  const now = new Date();
  if (day !== dhakaDay(now) || dayWindowStatus(await getSettings(env.DB), now) === 'after_cutoff') {
    return error(409, 'cannot_skip', 'Only today can be skipped, and only before the cutoff');
  }

  // The PK makes this atomic: an existing decided or skipped row means no insert happened.
  const { meta } = await env.DB.prepare(
    `INSERT INTO results (day, status, winner_snack_id, method, counts, decided_at)
     VALUES (?, 'skipped', NULL, 'no_votes', '[]', ?) ON CONFLICT (day) DO NOTHING`,
  )
    .bind(day, now.toISOString())
    .run();
  if (!meta.changes) return error(409, 'already_resolved', 'That day already has a result');
  return json({ day, status: 'skipped' });
};
