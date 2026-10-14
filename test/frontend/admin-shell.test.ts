/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const readHtml = () => readFileSync('public/admin.html', 'utf8');
const sources = import.meta.glob<string>('../../public/js/**/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Node 26's native localStorage shadows jsdom's; install explicit in-memory storages (see api.test.ts).
const memStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: unknown) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
};
let session: ReturnType<typeof memStorage>;
let fetchMock: ReturnType<typeof vi.fn>;

const settle = () => new Promise((r) => setTimeout(r, 0));
// Serve admin.html's body and run main.js, as a browser load of /admin.html would.
const boot = async () => {
  const html = readHtml();
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.indexOf('</body>')).replace(/<body[^>]*>/, '');
  vi.resetModules();
  await import(/* @vite-ignore */ `../../public/js/admin/${'main'}.js`);
  await settle();
};
const prompt = () => document.getElementById('pin-prompt') as HTMLElement;
const sections = () => document.getElementById('admin-sections') as HTMLElement;
const submit = async (pin: string) => {
  (prompt().querySelector('input') as HTMLInputElement).value = pin;
  prompt().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await settle();
};

beforeEach(() => {
  session = memStorage();
  vi.stubGlobal('localStorage', memStorage());
  vi.stubGlobal('sessionStorage', session);
  fetchMock = vi.fn(async () => json({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('admin shell', () => {
  it('with no stored PIN shows the prompt, hides the sections and makes no admin call', async () => {
    await boot();
    expect(prompt().hidden).toBe(false);
    expect(prompt().querySelector('input')).not.toBeNull();
    expect(sections().hidden).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a PIN rejected with 401 is cleared and shows an error; sections stay hidden', async () => {
    fetchMock.mockImplementation(async () => json({ error: { code: 'unauthorized', message: 'Unauthorized' } }, 401));
    await boot();
    await submit('wrong');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/settings');
    expect(new Headers((init as RequestInit).headers).get('X-Admin-Pin')).toBe('wrong');
    expect(session.getItem('snack.adminPin')).toBeNull();
    expect(sections().hidden).toBe(true);
    expect(prompt().hidden).toBe(false);
    expect(prompt().textContent!.trim().length).toBeGreaterThan(0);
    expect(prompt().querySelector('[role="alert"]')!.textContent!.trim()).not.toBe('');
  });

  it('an accepted PIN is stored in sessionStorage, hides the prompt and mounts the three sections', async () => {
    await boot();
    await submit('right');
    expect(session.getItem('snack.adminPin')).toBe('right');
    expect(prompt().hidden).toBe(true);
    expect(sections().hidden).toBe(false);
    for (const id of ['menu', 'employees', 'controls']) {
      expect(document.getElementById(id)!.childNodes.length).toBeGreaterThan(0);
    }
  });

  it('a stored PIN that validates keeps access across a re-boot without prompting', async () => {
    session.setItem('snack.adminPin', 'right');
    await boot();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prompt().hidden).toBe(true);
    expect(sections().hidden).toBe(false);
  });

  it('a stored PIN that now gets 401 is cleared and the prompt returns', async () => {
    session.setItem('snack.adminPin', 'stale');
    fetchMock.mockImplementation(async () => json({ error: { code: 'unauthorized', message: 'Unauthorized' } }, 401));
    await boot();
    expect(session.getItem('snack.adminPin')).toBeNull();
    expect(prompt().hidden).toBe(false);
    expect(sections().hidden).toBe(true);
  });
});

describe('PIN never in served files (FR-9)', () => {
  it('has no PIN literal in admin.html or public/js/**', () => {
    const files: Record<string, string> = { 'public/admin.html': readHtml(), ...sources };
    expect(Object.keys(files).length).toBeGreaterThan(1);
    for (const [name, src] of Object.entries(files)) {
      expect(src, name).not.toMatch(/ADMIN_PIN/);
      expect(src, name).not.toMatch(/\bpin\w*\s*[:=]\s*['"`][^'"`\s]/i);
      expect(src, name).not.toMatch(/setPin\(\s*['"`\d]/);
      expect(src, name).not.toMatch(/value=["']?\d{3,}/);
    }
  });
});
