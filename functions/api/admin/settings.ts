import type { Env } from '../../_lib/env';
import { error, json, readJsonObject } from '../../_lib/http';
import { isValidWindow } from '../../_lib/time';

interface SettingsRow {
  open_time: string;
  cutoff_time: string;
  working_days: string; // comma-separated ISO weekdays
}

const view = (row: SettingsRow) => ({
  open_time: row.open_time,
  cutoff_time: row.cutoff_time,
  working_days: row.working_days.split(',').map(Number),
});

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const row = await env.DB.prepare('SELECT open_time, cutoff_time, working_days FROM settings WHERE id = 1').first<SettingsRow>();
  return json(view(row!));
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const { open_time, cutoff_time, working_days } = parsed.body;

  if (typeof open_time !== 'string' || typeof cutoff_time !== 'string' || !isValidWindow(open_time, cutoff_time)) {
    return error(400, 'invalid_window', 'open_time and cutoff_time must be HH:MM with cutoff_time after open_time');
  }
  if (
    !Array.isArray(working_days) ||
    working_days.length === 0 ||
    !working_days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ||
    new Set(working_days).size !== working_days.length
  ) {
    return error(400, 'invalid_working_days', 'working_days must be a non-empty list of unique integers 1-7');
  }

  const row = await env.DB.prepare(
    'UPDATE settings SET open_time = ?, cutoff_time = ?, working_days = ? WHERE id = 1 RETURNING open_time, cutoff_time, working_days',
  )
    .bind(open_time, cutoff_time, [...(working_days as number[])].sort((a, b) => a - b).join(','))
    .first<SettingsRow>();
  return json(view(row!));
};
