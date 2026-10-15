import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../public/js/admin/controls.js';

const snacks = [{ id: 1, name: 'Chips', count: 2 }];
const settings = { open_time: '09:00', cutoff_time: '14:00', working_days: [1, 2, 3, 4, 5] };
const stateOf = (over: Record<string, unknown> = {}) => ({
  day: '2026-10-15',
  status: 'open',
  window: { open_time: '09:00', cutoff_time: '14:00' },
  snacks,
  result: null,
  ...over,
});

let el: HTMLElement;
let api: Record<string, ReturnType<typeof vi.fn>>;
const flush = () => new Promise((r) => setTimeout(r, 0));
const button = (re: RegExp) => [...el.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))!;

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T04:00:00Z')); // 10:00 Dhaka, before cutoff
});
afterEach(() => vi.useRealTimers());

describe('admin controls styling (FR-15)', () => {
  it('lays the form out in a wrapping row holding the weekday labels', async () => {
    await setup(stateOf());
    const form = el.querySelector('.row')!;
    expect(form).not.toBeNull();
    expect(form.querySelectorAll('label input[name="working_days"]')).toHaveLength(7);
    expect(form.querySelector('input[name="open_time"]')).not.toBeNull();
  });

  it('leaves Save as a plain button', async () => {
    await setup(stateOf());
    expect(button(/save/i).className).toBe('');
  });

  it('gives Skip day btn-quiet', async () => {
    await setup(stateOf());
    expect(button(/skip day/i).classList.contains('btn-quiet')).toBe(true);
  });

  it('keeps Override winner plain and the select unstyled inline', async () => {
    await setup(stateOf({ status: 'decided', result: { winner: snacks[0], method: 'votes', counts: [] } }));
    expect(button(/override winner/i).className).toBe('');
    const select = el.querySelector('select')!;
    expect(select.getAttribute('style')).toBeNull();
    expect(select.className).toBe('');
  });

  it.each([
    ['open', 'badge-open'],
    ['skipped', 'badge-skipped'],
    ['decided', 'badge-decided'],
    ['closed', 'badge-closed'],
  ])('shows a %s day as .%s', async (status, cls) => {
    await setup(stateOf({ status, result: status === 'decided' ? { winner: snacks[0], method: 'votes', counts: [] } : null }));
    const badges = el.querySelectorAll('.badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].classList.contains(cls)).toBe(true);
    expect(badges[0].textContent).toBeTruthy();
  });

  it('renders a failed save as .alert.error[role=alert]', async () => {
    await setup(stateOf());
    api.adminPut.mockRejectedValueOnce(new Error('cutoff_time must be after open_time'));
    button(/save/i).click();
    await flush();
    const alert = el.querySelector('.alert.error[role="alert"]')!;
    expect(alert.textContent).toContain('cutoff_time must be after open_time');
  });
});
