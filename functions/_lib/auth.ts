const sha256 = async (s: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

// Hash both sides so lengths always match, then OR-accumulate the byte diffs (no early exit).
export async function pinMatches(
  given: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret) return false; // fail closed: unset or empty secret
  const [a, b] = await Promise.all([sha256(given ?? ''), sha256(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 && !!given;
}
