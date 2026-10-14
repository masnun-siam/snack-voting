import type { Env } from '../_lib/env';
import { json } from '../_lib/http';

interface Row {
  day: string;
  status: 'decided' | 'skipped';
  winner: string | null;
  method: string;
  counts: string;
}

// Only stored snapshots are read (results.counts), never votes/employees, so no voter data can leak
// and retired snacks or deactivated employees cannot alter old rows.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT r.day, r.status, s.name AS winner, r.method, r.counts
       FROM results r LEFT JOIN snacks s ON r.winner_snack_id = s.id
      ORDER BY r.day DESC LIMIT 30`,
  ).all<Row>();
  return json(
    results.map((r) => ({
      day: r.day,
      winner: r.winner,
      counts: JSON.parse(r.counts),
      // results.method has no 'skipped' value; the status carries it.
      method: r.status === 'skipped' ? 'skipped' : r.method,
    })),
  );
};
