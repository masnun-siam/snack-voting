import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const yml = readFileSync('.github/workflows/deploy.yml', 'utf8');
const deployJob = yml.slice(yml.search(/^ {2}deploy:/m));

describe('deploy workflow (FR-14)', () => {
  it('runs on push to main and on pull requests', () => {
    expect(yml).toMatch(/^ {2}push:\s*\n\s+branches: \[main\]/m);
    expect(yml).toMatch(/^ {2}pull_request:/m);
  });

  it('gates deploy on a push to main after the test job', () => {
    expect(yml).toMatch(/^ {2}test:/m);
    expect(deployJob).toMatch(/^ {4}needs: test$/m);
    expect(deployJob).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
  });

  it('applies migrations before the Pages deploy', () => {
    const migrate = deployJob.indexOf('wrangler d1 migrations apply snack-voting --remote');
    const publish = deployJob.indexOf('wrangler pages deploy public --project-name snack-voting');
    expect(migrate).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(migrate);
  });

  it('uses credentials only as secrets references and never mentions ADMIN_PIN', () => {
    const refs = yml.match(/CLOUDFLARE_\w+.*/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const line of refs) expect(line).toMatch(/\$\{\{ secrets\.CLOUDFLARE_\w+ \}\}/);
    expect(yml).not.toContain('ADMIN_PIN');
  });

  it('is least-privilege', () => {
    expect(yml).toMatch(/^permissions:\s*\n\s+contents: read/m);
  });
});
