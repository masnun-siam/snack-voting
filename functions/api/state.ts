// Voter-facing day state. Decides the day on the first load after cutoff (FR-5). No per-voter data leaves here (FR-4).
import { countVotes } from '../_lib/counts';
import { decideDay } from '../_lib/decide';
import { getDayState, getSettings } from '../_lib/day';
import type { Env } from '../_lib/env';
import { json } from '../_lib/http';
import { dayWindowStatus } from '../_lib/time';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const db = env.DB;
  const now = new Date();
  let state = await getDayState(db, now);
  if (state.status === 'closed' && dayWindowStatus(await getSettings(db), now) === 'after_cutoff') {
    await decideDay(db, state.day);
    state = await getDayState(db, now);
  }

  const employee = Number(new URL(request.url).searchParams.get('employee'));
  const [approved, counts, myVote, employees] = await Promise.all([
    db.prepare(`SELECT id, name FROM snacks WHERE status = 'approved' ORDER BY name`).all<{ id: number; name: string }>(),
    countVotes(db, state.day),
    Number.isInteger(employee) && employee > 0
      ? db.prepare('SELECT snack_id FROM votes WHERE day = ? AND employee_id = ?').bind(state.day, employee).first<{ snack_id: number }>()
      : null,
    db.prepare('SELECT count(*) AS n FROM employees WHERE active = 1').first<{ n: number }>(),
  ]);

  const countOf = new Map(counts.map((c) => [c.snack_id, c.count]));
  const snacks = approved.results.map((s) => ({ ...s, count: countOf.get(s.id) ?? 0 }));
  // First by count; ties go to the first in name order (sort is stable).
  const top = [...snacks].sort((a, b) => b.count - a.count)[0];

  let result = null;
  if (state.status === 'decided' && state.result) {
    const r = state.result;
    const winner = r.winner_snack_id
      ? await db.prepare('SELECT id, name FROM snacks WHERE id = ?').bind(r.winner_snack_id).first<{ id: number; name: string }>()
      : null;
    result = { winner, method: r.method, counts: JSON.parse(r.counts) };
  }

  return json({
    day: state.day,
    status: state.status,
    window: state.window,
    snacks,
    leader: top && top.count > 0 ? top.id : null,
    my_vote: myVote?.snack_id ?? null,
    result,
    no_snacks: snacks.length === 0,
    no_employees: (employees?.n ?? 0) === 0,
  });
};
