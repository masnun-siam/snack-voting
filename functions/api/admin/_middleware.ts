import type { Env } from '../../_lib/env';
import { pinMatches } from '../../_lib/auth';
import { error } from '../../_lib/http';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (!(await pinMatches(context.request.headers.get('X-Admin-Pin'), context.env.ADMIN_PIN))) {
    return error(401, 'unauthorized', 'Missing or invalid admin PIN');
  }
  return context.next();
};
