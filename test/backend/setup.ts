import { env } from 'cloudflare:workers';
import initSql from '../../migrations/0001_init.sql?raw';

// D1 exec() is line-based, so split into statements and batch them.
// Migration comments must not contain ';'.
const statements = initSql
  .replace(/--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
