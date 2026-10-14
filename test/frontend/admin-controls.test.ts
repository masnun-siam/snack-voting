import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../public/js/admin/controls.js';

const snacks = [
  { id: 1, name: 'Chips', count: 2 },
  { id: 2, name: 'Samosa', count: 5 },
];
const settings = { open_time: '09:00', cutoff_time: '14:00', working_days: [1, 2, 3, 4, 5] };
const stateOf = (over: Record<string, unknown> = {}) => ({
  day: '2026-10-15',
  status: 'open',
  window: { open_time: '09:00', cutoff_time: '14:00' },
  snacks,
  result: null,
  ...over,
});
const decided = (method = 'votes', winner: unknown = snacks[1]) =>
  stateOf({ status: 'decided', result: { winner, method, counts: [] } });

let el: HTMLElement;
let api: Record<string, ReturnType<typeof vi.fn>>;
const flush = () => new Promise((r) => setTimeout(r, 0));
const text = () => el.textContent ?? '';
const button = (re: RegExp) => [...el.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''));
const input = (name: string) => el.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;

const setup = async (state: unknown) => {
  el = document.createElement('div');
  api = {
    getState: vi.fn(async () => state),
    adminGet: vi.fn(async () => settings),
    adminPut: vi.fn(async (_p: string, body: unknown) => body),
    adminPost: vi.fn(async () => ({ ok: true })),
  };
  mount(el, { api });
  await flush();
};

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('settings form (FR-11)', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-10-15T04:00:00Z'))); // 10:00 Dhaka

  it('loads GET /admin/settings and shows open time, cutoff and weekdays', async () => {
    await setup(stateOf());
    expect(api.adminGet).toHaveBeenCalledWith('/admin/settings');
    expect(input('open_time').value).toBe('09:00');
    expect(input('cutoff_time').value).toBe('14:00');
    const days = [...el.querySelectorAll<HTMLInputElement>('input[name="working_days"]')];
    expect(days).toHaveLength(7);
    expect(days.filter((d) => d.checked).map((d) => d.value)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('saves edited values with PUT /admin/settings', async () => {
    await setup(stateOf());
    input('cutoff_time').value = '15:30';
    el.querySelector<HTMLInputElement>('input[name="working_days"][value="6"]')!.checked = true;
    button(/save/i)!.click();
    await flush();
    expect(api.adminPut).toHaveBeenCalledWith('/admin/settings', {
      open_time: '09:00',
      cutoff_time: '15:30',
      working_days: [1, 2, 3, 4, 5, 6],
    });
    expect(text().toLowerCase()).toContain('saved');
  });

  it('shows the server error when the cutoff is not after opening', async () => {
    await setup(stateOf());
    api.adminPut.mockRejectedValueOnce(new Error('cutoff_time must be after open_time'));
    input('cutoff_time').value = '08:00';
    button(/save/i)!.click();
    await flush();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('cutoff_time must be after open_time');
    expect(text().toLowerCase()).not.toContain('saved');
  });

  it('renders server text as text, never as markup', async () => {
    await setup(decided('votes', { id: 9, name: '<img src=x onerror=alert(1)>' }));
    expect(el.querySelector('img')).toBeNull();
    expect(text()).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('skip day (FR-10)', () => {
  it('is offered before cutoff and posts the skip for the state day, then reloads', async () => {
    vi.setSystemTime(new Date('2026-10-15T04:00:00Z')); // 10:00 Dhaka
    await setup(stateOf());
    api.getState.mockResolvedValue(stateOf({ status: 'skipped' }));
    button(/skip day/i)!.click();
    await flush();
    expect(api.adminPost).toHaveBeenCalledWith('/admin/days/2026-10-15/skip');
    expect(button(/skip day/i)).toBeUndefined();
    expect(text().toLowerCase()).toContain('skipped');
  });

  it('is offered on a closed day before opening', async () => {
    vi.setSystemTime(new Date('2026-10-15T02:00:00Z')); // 08:00 Dhaka
    await setup(stateOf({ status: 'closed' }));
    expect(button(/skip day/i)).toBeDefined();
  });

  it('is hidden once the day is skipped', async () => {
    vi.setSystemTime(new Date('2026-10-15T04:00:00Z'));
    await setup(stateOf({ status: 'skipped' }));
    expect(button(/skip day/i)).toBeUndefined();
  });

  it('is hidden once the day is decided', async () => {
    vi.setSystemTime(new Date('2026-10-15T04:00:00Z'));
    await setup(decided());
    expect(button(/skip day/i)).toBeUndefined();
  });

  it('is hidden after cutoff', async () => {
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z')); // 16:00 Dhaka
    await setup(stateOf({ status: 'closed' }));
    expect(button(/skip day/i)).toBeUndefined();
  });

  it('shows the server message on a 409', async () => {
    vi.setSystemTime(new Date('2026-10-15T04:00:00Z'));
    await setup(stateOf());
    api.adminPost.mockRejectedValueOnce(new Error('Day already decided'));
    button(/skip day/i)!.click();
    await flush();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Day already decided');
  });
});

describe('override winner (FR-10)', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-10-15T10:00:00Z')));

  it('is hidden unless the day is decided', async () => {
    for (const status of ['open', 'closed', 'skipped']) {
      await setup(stateOf({ status }));
      expect(el.querySelector('select'), status).toBeNull();
      expect(button(/override/i), status).toBeUndefined();
    }
  });

  it('lists every approved snack and posts the chosen one, then shows "set by admin"', async () => {
    await setup(decided());
    const select = el.querySelector('select')!;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Chips', 'Samosa']);
    select.value = '1';
    api.getState.mockResolvedValue(decided('admin', snacks[0]));
    button(/override/i)!.click();
    await flush();
    expect(api.adminPost).toHaveBeenCalledWith('/admin/days/2026-10-15/override', { snack_id: 1 });
    expect(text()).toContain('Chips');
    expect(text().toLowerCase()).toContain('set by admin');
  });

  it('shows the server message on a 409', async () => {
    await setup(decided());
    api.adminPost.mockRejectedValueOnce(new Error('Only a decided day can be overridden'));
    button(/override/i)!.click();
    await flush();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Only a decided day can be overridden');
  });
});
