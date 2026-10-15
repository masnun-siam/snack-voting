import { describe, expect, it, vi } from 'vitest';
import { mount } from '../../public/js/views/history.js';

type Entry = { day: string; winner: string | null; counts: Record<string, number>; method: string };

const setup = (getHistory: () => Promise<Entry[]>) => {
  const el = document.createElement('div');
  mount(el, { employee: null, state: { status: 'open' }, api: { getHistory: vi.fn(getHistory) }, refresh: async () => {} });
  return el;
};

describe('history view styling', () => {
  it.each([
    ['votes', 'badge-decided', /votes/i],
    ['tie_random', 'badge-tie', /random tie pick/i],
    ['admin', 'badge-admin', /admin override/i],
    ['no_votes', 'badge-novotes', /no votes/i],
    ['skipped', 'badge-skipped', /skipped/i],
  ])('renders a %s day as a card with a %s badge', async (method, cls, label) => {
    const winner = method === 'no_votes' || method === 'skipped' ? null : 'Tea';
    const el = setup(async () => [{ day: '2026-10-12', winner, counts: { Tea: 2 }, method }]);
    await vi.waitFor(() => expect(el.querySelector('li.card')).not.toBeNull());
    const badge = el.querySelector('li.card .badge')!;
    expect(badge.classList.contains(cls)).toBe(true);
    expect(badge.textContent).toMatch(label);
    if (winner) expect(el.querySelector('li.card')!.textContent).toContain(winner);
  });

  it('lays the list out with list and stack', async () => {
    const el = setup(async () => [{ day: '2026-10-12', winner: 'Tea', counts: {}, method: 'votes' }]);
    await vi.waitFor(() => expect(el.querySelector('ul')).not.toBeNull());
    expect(el.querySelector('ul')!.classList.contains('list')).toBe(true);
    expect(el.querySelector('ul')!.classList.contains('stack')).toBe(true);
  });

  it('styles the empty message as muted', async () => {
    const el = setup(async () => []);
    await vi.waitFor(() => expect(el.textContent).toMatch(/no decided days/i));
    expect(el.querySelector('p.muted')).not.toBeNull();
  });

  it('styles a load error as an alert with a quiet Retry button', async () => {
    const el = setup(async () => {
      throw new Error('boom');
    });
    await vi.waitFor(() => expect(el.querySelector('.alert')).not.toBeNull());
    expect(el.querySelector('.alert')!.textContent).toContain('boom');
    expect(el.querySelector('button.btn-quiet')!.textContent).toMatch(/retry/i);
  });
});
