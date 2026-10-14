import { env } from 'cloudflare:test';
import { it, expect } from 'vitest';

it('exposes the D1 binding', () => {
  expect(env.DB).toBeDefined();
});
