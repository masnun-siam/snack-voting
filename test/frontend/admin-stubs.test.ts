import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sections = ['menu', 'employees', 'controls'];

describe.each(sections)('admin/%s stub', (name) => {
  it('exports mount that renders a placeholder without throwing', async () => {
    const mod = await import(/* @vite-ignore */ `../../public/js/admin/${name}.js`);
    const el = document.createElement('div');
    expect(() => mod.mount(el, { api: {} })).not.toThrow();
    expect(el.childNodes.length).toBeGreaterThan(0);
  });

  it('documents the ctx = {api} contract in a header comment', () => {
    const src = readFileSync(`public/js/admin/${name}.js`, 'utf8');
    expect(src.trimStart().startsWith('/*') || src.trimStart().startsWith('//')).toBe(true);
    const header = src.slice(0, src.indexOf('export'));
    expect(header).toContain('ctx = {api}');
  });
});
