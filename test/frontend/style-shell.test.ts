import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync('public/index.html', 'utf8');

const memStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: unknown) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
};

const baseState = {
  day: '2026-10-15',
  status: 'open',
  window: {},
  snacks: [],
  leader: null,
  my_vote: null,
  result: null,
  no_snacks: false,
  no_employees: false,
};

let local: ReturnType<typeof memStorage>;
let employees: unknown[];
let fail: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const boot = async () => {
  vi.resetModules();
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  await import('../../public/js/main.js');
};
const button = (re: RegExp) =>
  [...document.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))!;

beforeEach(() => {
  local = memStorage();
  employees = [
    { id: 1, name: 'Asha' },
    { id: 2, name: 'Ben' },
  ];
  fail = false;
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', memStorage());
  fetchMock = vi.fn(async (url: string) => {
    if (fail) throw new TypeError('network down');
    if (String(url) === '/api/history') return reply([]);
    return reply(String(url).startsWith('/api/state') ? baseState : employees);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

describe('voter shell styling', () => {
  it('links the theme stylesheet and has no inline style block', () => {
    expect(html).toContain('<link rel="stylesheet" href="/css/theme.css">');
    expect(html).not.toMatch(/<style/i);
    expect(html).toMatch(/name="viewport"/);
  });

  it('puts picker buttons in .names', async () => {
    await boot();
    await vi.waitFor(() => button(/asha/i) || Promise.reject(new Error('no picker')));
    const names = document.querySelector('#picker .names')!;
    expect(names).toBeTruthy();
    expect(names.contains(button(/asha/i))).toBe(true);
    expect(names.contains(button(/ben/i))).toBe(true);
  });

  it('gives "Not you?" the quiet button class', async () => {
    local.setItem('snack.employee', '1');
    await boot();
    await vi.waitFor(() => button(/not you/i) || Promise.reject(new Error('no chip')));
    expect(button(/not you/i).classList.contains('btn-quiet')).toBe(true);
  });

  it('marks the no-employees paragraph muted', async () => {
    employees = [];
    await boot();
    await vi.waitFor(() => {
      if (!/no employees yet/i.test(document.body.textContent ?? '')) throw new Error('not yet');
    });
    expect(document.querySelector('#picker p')!.classList.contains('muted')).toBe(true);
  });

  it('renders a failed load as .alert with a quiet Retry button', async () => {
    fail = true;
    await boot();
    await vi.waitFor(() => {
      if (!document.querySelector('#status.alert')) throw new Error('not yet');
    });
    const retry = document.querySelector('#status.alert button')!;
    expect(retry.textContent).toBe('Retry');
    expect(retry.classList.contains('btn-quiet')).toBe(true);
  });

  it('marks the loading state muted', async () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    await boot();
    expect(document.getElementById('status')!.textContent).toMatch(/loading/i);
    expect(document.getElementById('status')!.classList.contains('muted')).toBe(true);
  });
});
