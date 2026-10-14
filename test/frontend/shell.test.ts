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

const EMPLOYEES = [
  { id: 1, name: 'Asha' },
  { id: 2, name: 'Ben' },
];
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
let state: Record<string, unknown>;
let employees: unknown[];
let fail: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const stateCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/state')).length;

// Fresh page + fresh module graph = a browser reload.
const boot = async () => {
  vi.resetModules();
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  await import('../../public/js/main.js');
};
const $ = (id: string) => document.getElementById(id)!;
const button = (re: RegExp) =>
  [...document.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))!;

beforeEach(() => {
  local = memStorage();
  state = { ...baseState };
  employees = EMPLOYEES;
  fail = false;
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', memStorage());
  fetchMock = vi.fn(async (url: string) => {
    if (fail) throw new TypeError('network down');
    return reply(String(url).startsWith('/api/state') ? state : employees);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

describe('picker', () => {
  it('lists active employees when none is chosen, after a loading state', async () => {
    let release!: (v: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await boot();
    expect(document.body.textContent).toMatch(/loading/i);
    release(reply(state));
    await vi.waitFor(() => expect(button(/asha/i)).toBeTruthy());
    expect(button(/ben/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/loading/i);
  });

  it('keeps the picked employee across a reload', async () => {
    await boot();
    await vi.waitFor(() => button(/ben/i));
    button(/ben/i).click();
    await vi.waitFor(() => expect(button(/not you/i)).toBeTruthy());
    expect(local.getItem('snack.employee')).toBe('2');

    await boot();
    await vi.waitFor(() => expect(button(/not you/i)).toBeTruthy());
    expect($('picker').textContent).toContain('Ben');
    expect(button(/asha/i)).toBeUndefined();
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/state?employee=2')).toBe(true);
  });

  it('"not you?" clears the choice and shows the list again', async () => {
    local.setItem('snack.employee', 1);
    await boot();
    await vi.waitFor(() => expect(button(/not you/i)).toBeTruthy());
    button(/not you/i).click();
    await vi.waitFor(() => expect(button(/ben/i)).toBeTruthy());
    expect(local.getItem('snack.employee')).toBeNull();
    expect(button(/not you/i)).toBeUndefined();
  });

  it('ignores a stored id that is no longer an active employee', async () => {
    local.setItem('snack.employee', 99);
    await boot();
    await vi.waitFor(() => expect(button(/asha/i)).toBeTruthy());
    expect(button(/not you/i)).toBeUndefined();
  });

  it('tells admins to add employees when there are none', async () => {
    employees = [];
    state = { ...baseState, no_employees: true };
    await boot();
    await vi.waitFor(() => expect($('picker').textContent).toMatch(/admin/i));
    expect(document.querySelectorAll('#picker button').length).toBe(0);
  });
});

describe('views', () => {
  it('mounts vote, suggest and history once an employee is chosen', async () => {
    local.setItem('snack.employee', 1);
    await boot();
    await vi.waitFor(() => expect($('vote').textContent).toMatch(/placeholder/));
    expect($('suggest').textContent).toMatch(/placeholder/);
    expect($('history').textContent).toMatch(/placeholder/);
  });
});

describe('error state', () => {
  it('shows an error with a Retry button that reloads', async () => {
    fail = true;
    await boot();
    await vi.waitFor(() => expect(button(/retry/i)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/loading/i);

    fail = false;
    button(/retry/i).click();
    await vi.waitFor(() => expect(button(/asha/i)).toBeTruthy());
    expect(button(/retry/i)).toBeUndefined();
  });
});

describe('polling', () => {
  it('refreshes every 15s while open and stops once status leaves open', async () => {
    await boot();
    await vi.waitFor(() => expect(button(/asha/i)).toBeTruthy());
    const base = stateCalls();

    await vi.advanceTimersByTimeAsync(15000);
    await vi.waitFor(() => expect(stateCalls()).toBe(base + 1));

    state = { ...baseState, status: 'closed' };
    await vi.advanceTimersByTimeAsync(15000);
    await vi.waitFor(() => expect(stateCalls()).toBe(base + 2));

    await vi.advanceTimersByTimeAsync(60000);
    expect(stateCalls()).toBe(base + 2);
  });

  it('never polls when the first state is not open', async () => {
    state = { ...baseState, status: 'decided' };
    await boot();
    await vi.waitFor(() => expect(button(/asha/i)).toBeTruthy());
    const base = stateCalls();
    await vi.advanceTimersByTimeAsync(60000);
    expect(stateCalls()).toBe(base);
  });
});
