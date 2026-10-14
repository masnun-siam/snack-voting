export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

export type JsonObjectResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: Response };

export async function readJsonObject(request: Request): Promise<JsonObjectResult> {
  const bad = (message: string): JsonObjectResult => ({
    ok: false,
    response: error(400, 'invalid_json', message),
  });
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return bad('Request body must be valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return bad('Request body must be a JSON object');
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}
