// Decide a day exactly once. Winner, method and counts are computed inside one INSERT … SELECT, so there is no
// read-then-write window: concurrent callers race on the PK and the losers' inserts are no-ops.
import { COUNTS_SQL } from './counts';
import type { ResultRow } from './day';

export async function decideDay(db: D1Database, day: string): Promise<ResultRow> {
  await db
    .prepare(
      `WITH c AS (${COUNTS_SQL}),
       top AS (
         SELECT snack_id, (SELECT count(*) FROM c c2 WHERE c2.count = c.count) AS tied
         FROM c WHERE count = (SELECT max(count) FROM c)
         ORDER BY RANDOM() LIMIT 1
       )
       INSERT INTO results (day, status, winner_snack_id, method, counts)
       SELECT ?1, 'decided', (SELECT snack_id FROM top),
         CASE WHEN NOT EXISTS (SELECT 1 FROM top) THEN 'no_votes'
              WHEN (SELECT tied FROM top) > 1 THEN 'tie_random'
              ELSE 'votes' END,
         -- {name: count}, the shape GET /history serves (FR-12); names are unique so keys don't collide.
         COALESCE((SELECT json_group_object(name, count) FROM c), '{}')
       WHERE true
       ON CONFLICT (day) DO NOTHING`,
    )
    .bind(day)
    .run();
  // Whoever won the race (or an existing skipped row) is what we return.
  return (await db.prepare('SELECT * FROM results WHERE day = ?').bind(day).first<ResultRow>())!;
}
