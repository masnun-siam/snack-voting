// Per-snack vote counts for a day. Joins to snacks only, so votes from since-deactivated employees still count
// and no voter id ever leaves the query.
export interface SnackCount {
  snack_id: number;
  name: string;
  count: number;
}

// Shared with decideDay so the snapshot and the winner come from the same query. Binds ?1 = day.
export const COUNTS_SQL = `SELECT s.id AS snack_id, s.name AS name, count(*) AS count
  FROM votes v JOIN snacks s ON s.id = v.snack_id
  WHERE v.day = ?1
  GROUP BY s.id, s.name`;

export async function countVotes(db: D1Database, day: string): Promise<SnackCount[]> {
  const { results } = await db.prepare(`${COUNTS_SQL} ORDER BY count DESC, name`).bind(day).all<SnackCount>();
  return results;
}
