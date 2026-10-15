import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('public/css/theme.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Flat list of rules (media-query wrappers are skipped by the regex).
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
  selectors: sel.split(',').map((s) => s.trim()),
  body,
}));
const hasSelector = (re: RegExp) => rules.some((r) => r.selectors.some((s) => re.test(s)));

const root = rules.find((r) => r.selectors.includes(':root'))?.body ?? '';
const vars = Object.fromEntries([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const decl = (body: string, prop: string) =>
  body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`))?.[1].trim();
// A hex colour, directly or through var(--x), else undefined.
const hex = (v?: string) => {
  const name = v?.match(/^var\((--[\w-]+)\)$/)?.[1];
  const val = name ? vars[name] : v;
  return val && /^#[0-9a-f]{6}$/i.test(val) ? val : undefined;
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('theme.css tokens', () => {
  it('defines palette, type scale, spacing, radius and shadow on :root', () => {
    for (const name of [
      '--bg', '--surface', '--ink', '--muted', '--accent', '--accent-ink',
      '--text-sm', '--text-base', '--text-lg', '--text-xl', '--text-2xl',
      '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6',
      '--radius', '--shadow',
    ]) {
      expect(vars, name).toHaveProperty(name);
    }
  });

  it('is a warm cream background', () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(vars['--bg'].slice(i, i + 2), 16));
    expect(r).toBeGreaterThanOrEqual(0xf5);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeGreaterThanOrEqual(0xd0);
  });
});

describe('theme.css vocabulary', () => {
  it.each([
    'stack', 'row', 'list', 'muted', 'card', 'alert', 'btn-quiet', 'badge',
    'badge-open', 'badge-closed', 'badge-decided', 'badge-skipped',
    'badge-pending', 'badge-approved', 'badge-retired',
    'badge-tie', 'badge-admin', 'badge-novotes',
    'winner', 'names',
  ])('has .%s', (cls) => {
    expect(hasSelector(new RegExp(`\\.${cls}(?![\\w-])`))).toBe(true);
  });

  it('styles .alert on [role="status"] too', () => {
    expect(hasSelector(/\[role=["']?status["']?\]/)).toBe(true);
  });

  it.each(['button', 'input', 'select', 'textarea', 'label', 'h1', 'ul'])('styles <%s> by element selector', (el) => {
    expect(hasSelector(new RegExp(`(^|[\\s>+~])${el}(?![\\w-])`))).toBe(true);
  });

  it('gives buttons a 44px touch target, a focus ring and a disabled look', () => {
    const body = rules.filter((r) => r.selectors.includes('button')).map((r) => r.body).join(';');
    expect(body).toMatch(/min-height\s*:\s*44px/);
    expect(hasSelector(/:focus-visible/)).toBe(true);
    expect(hasSelector(/:disabled/)).toBe(true);
  });

  it('uses a system font stack only', () => {
    expect(css).not.toMatch(/@import|@font-face|https?:\/\//i);
  });
});

describe('theme.css contrast (WCAG AA)', () => {
  it('ink and muted text pass 4.5:1 on the page and card backgrounds', () => {
    for (const fg of ['--ink', '--muted'])
      for (const bg of ['--bg', '--surface']) {
        expect(ratio(vars[fg], vars[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    expect(ratio(vars['--accent-ink'], vars['--accent'])).toBeGreaterThanOrEqual(4.5);
  });

  it('every rule colour pair passes, and text-only rules pass on bg and surface', () => {
    let pairs = 0;
    for (const { selectors, body } of rules) {
      const fg = hex(decl(body, 'color'));
      if (!fg) continue;
      const bg = hex(decl(body, 'background-color') ?? decl(body, 'background'));
      const against = bg ? [bg] : [vars['--bg'], vars['--surface']];
      for (const b of against) {
        pairs++;
        expect(ratio(fg, b), `${selectors.join(',')}: ${fg} on ${b}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Every badge modifier is its own pair, plus button, alert, quiet button, winner.
    expect(pairs).toBeGreaterThanOrEqual(12);
  });
});

describe('theme.css layout', () => {
  it('uses border-box', () => {
    expect(css).toMatch(/box-sizing\s*:\s*border-box/);
  });

  it('declares no width above 360px', () => {
    for (const m of css.matchAll(/(?<![-\w])(?:min-)?width\s*:\s*([\d.]+)(px|rem)/g)) {
      const px = Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
      expect(px, m[0]).toBeLessThanOrEqual(360);
    }
  });

  it('keeps main fluid and centred', () => {
    const body = rules.filter((r) => r.selectors.includes('main')).map((r) => r.body).join(';');
    expect(body).toMatch(/max-width\s*:\s*[\d.]+rem/);
    expect(body).toMatch(/margin\s*:\s*0 auto/);
  });

  it('keeps [hidden] and empty sections hidden', () => {
    const hidden = rules.find((r) => r.selectors.includes('[hidden]'));
    expect(hidden?.body).toMatch(/display\s*:\s*none/);
    const empty = rules.find((r) => r.selectors.includes('section:empty'));
    expect(empty?.selectors).toContain('#status:empty');
    expect(empty?.body).toMatch(/display\s*:\s*none/);
  });

  it('keeps the .names auto-fill grid', () => {
    const names = rules.find((r) => r.selectors.includes('.names'));
    expect(names?.body).toMatch(/display\s*:\s*grid/);
    expect(names?.body).toMatch(/repeat\(auto-fill,\s*minmax\(8rem,\s*1fr\)\)/);
  });
});
