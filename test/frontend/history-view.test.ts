import { describe, expect, it, vi } from 'vitest';
import { mount, update } from '../../public/js/views/history.js';

type Entry = { day: string; winner: string | null; counts: Record<string, number>; method: string };

const setup = async (getHistory: () => Promise<Entry[]>) => {
  const el = document.createElement('div');
  const api = { getHistory: vi.fn(getHistory) };
  mount(el, { employee: null, state: { status: 'open' }, api, refresh: async () => {} });
  return { el, api };
};
const rows = (el: HTMLElement) => [...el.querySelectorAll('li')];
const retry = (el: HTMLElement) =>
  [...el.querySelectorAll('button')].find((b) => /retry/i.test(b.textContent ?? ''))!;

const DAYS: Entry[] = [
  { day: '2026-10-14', winner: 'Samosa', counts: { Samosa: 3, Tea: 1 }, method: 'votes' },
  { day: '2026-10-13', winner: 'Tea', counts: { Samosa: 2, Tea: 2 }, method: 'tie_random' },
];

describe('history view', () => {
  it('fetches on mount and lists each day with date, winner and counts per snack', async () => {
    const { el, api } = await setup(async () => DAYS);
    expect(el.textContent).toMatch(/loading/i);
    await vi.waitFor(() => expect(rows(el).length).toBe(2));
    expect(api.getHistory).toHaveBeenCalledTimes(1);
    const [first, second] = rows(el);
    expect(first.textContent).toContain('2026-10-14');
    expect(first.textContent).toContain('Samosa');
    expect(first.textContent).toMatch(/Samosa\D*3/);
    expect(first.textContent).toMatch(/Tea\D*1/);
    expect(second.textContent).toContain('2026-10-13');
    expect(el.textContent).not.toMatch(/loading/i);
  });

  it.each([
    ['votes', /votes/i],
    ['tie_random', /random tie pick/i],
    ['admin', /admin override/i],
    ['no_votes', /no votes/i],
    ['skipped', /skipped/i],
  ])('labels method %s', async (method, label) => {
    const winner = method === 'no_votes' || method === 'skipped' ? null : 'Tea';
    const { el } = await setup(async () => [{ day: '2026-10-12', winner, counts: {}, method }]);
    await vi.waitFor(() => expect(rows(el).length).toBe(1));
    expect(rows(el)[0].textContent).toMatch(label);
    expect(rows(el)[0].textContent).not.toMatch(/null|undefined/);
  });

  it('shows an empty message when there are no decided days', async () => {
    const { el } = await setup(async () => []);
    await vi.waitFor(() => expect(el.textContent).toMatch(/no decided days/i));
    expect(rows(el).length).toBe(0);
  });

  it('shows an error with Retry that refetches', async () => {
    let fail = true;
    const { el, api } = await setup(async () => {
      if (fail) throw new Error('boom');
      return DAYS;
    });
    await vi.waitFor(() => expect(retry(el)).toBeTruthy());
    expect(el.textContent).toContain('boom');
    expect(el.textContent).not.toMatch(/loading/i);

    fail = false;
    retry(el).click();
    await vi.waitFor(() => expect(rows(el).length).toBe(2));
    expect(api.getHistory).toHaveBeenCalledTimes(2);
    expect(retry(el)).toBeUndefined();
  });

  it('escapes winner and snack names', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { el } = await setup(async () => [
      { day: '2026-10-11', winner: evil, counts: { [evil]: 1 }, method: 'votes' },
    ]);
    await vi.waitFor(() => expect(rows(el).length).toBe(1));
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain(evil);
  });

  it('update() does not refetch while the status is unchanged', async () => {
    const { el, api } = await setup(async () => DAYS);
    await vi.waitFor(() => expect(rows(el).length).toBe(2));
    update({ status: 'open' });
    expect(api.getHistory).toHaveBeenCalledTimes(1);
    expect(rows(el).length).toBe(2);
  });

  it('update() refetches when the day status changes (e.g. open to decided)', async () => {
    const { el, api } = await setup(async () => DAYS);
    await vi.waitFor(() => expect(rows(el).length).toBe(2));
    update({ status: 'decided' });
    await vi.waitFor(() => expect(api.getHistory).toHaveBeenCalledTimes(2));
  });
});
