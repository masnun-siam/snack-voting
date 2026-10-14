import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
        test: {
          name: 'backend',
          include: ['test/backend/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'frontend',
          environment: 'jsdom',
          include: ['test/frontend/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
});
