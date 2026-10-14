import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// macOS writes ._* AppleDouble files on exFAT/network drives; they match *.test.ts but aren't tests.
const exclude = ['**/node_modules/**', '**/._*'];

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
        test: {
          name: 'backend',
          include: ['test/backend/**/*.test.ts'],
          exclude,
          setupFiles: ['test/backend/setup.ts'],
          passWithNoTests: true,
        },
      },
      {
        test: {
          name: 'frontend',
          environment: 'jsdom',
          include: ['test/frontend/**/*.test.ts'],
          exclude,
          passWithNoTests: true,
        },
      },
    ],
  },
});
