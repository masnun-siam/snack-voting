import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../public/js/views/vote.js';

const window_ = { open_time: '09:00', cutoff_time: '14:00' };
const snacks = [
  { id: 1, name: 'Chips', count: 2 },
  { id: 2, name: 'Samosa', count: 5 },
  { id: 3, name: 'Fruit', count: 0 },
];

const baseState = (over: Record<string, unknown> = {}) => ({
  day: '2026-10-15',
  status: 'open',
  window: window_,
  snacks,
  leader: 2,
  my_vote: null,
  result: null,
  no_snacks: false,
  no_employees: false,
  ...over,
});

let el: HTMLElement;
let postVote: ReturnType<typeof vi.fn>;
let refresh: ReturnType<typeof vi.fn>;

const setup = (state: unknown) => {
  el = document.createElement('div');
  postVote = vi.fn(async () => ({ ok: true }));
  refresh = vi.fn(async () => {});
  mount(el, { employee: { id: 7, name: 'Ann' }, state, api: { postVote }, refresh });
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('status badge', () => {
  const cases: [string, string][] = [
    ['open', 'Open'],
    ['closed', 'Closed'],
    ['decided', 'Decided'],
    ['skipped', 'Skipped'],
  ];
  it.each(cases)('%s state shows a badge-%s badge reading %s', (status, label) => {
    setup(baseState({ status, result: { method: 'votes', winner: { id: 2, name: 'Samosa' }, counts: [] } }));
    const badge = el.querySelector('.badge');
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains(`badge-${status}`)).toBe(true);
    expect(badge!.textContent).toBe(label);
  });
});

describe('snack list', () => {
  it('ul has list, each li has row, mine and leader classes are kept', () => {
    setup(baseState({ my_vote: 1 }));
    const ul = el.querySelector('ul')!;
    expect(ul.classList.contains('list')).toBe(true);
    const lis = [...ul.querySelectorAll('li')];
    expect(lis).toHaveLength(3);
    for (const li of lis) expect(li.classList.contains('row') || li.classList.contains('card')).toBe(true);
    expect(lis[0].querySelector('.mine')).not.toBeNull();
    expect(lis[1].querySelector('.leader')).not.toBeNull();
  });
});

describe('decided winner', () => {
  it('p.winner sits inside a .card', () => {
    setup(baseState({ status: 'decided', result: { method: 'votes', winner: { id: 2, name: 'Samosa' }, counts: [] } }));
    const winner = el.querySelector('p.winner');
    expect(winner).not.toBeNull();
    expect(winner!.closest('.card')).not.toBeNull();
  });
});

describe('error message', () => {
  it('keeps error and adds alert', async () => {
    setup(baseState());
    postVote.mockRejectedValueOnce(new Error('Voting closed at 14:00'));
    el.querySelector('button')!.click();
    await flush();
    const err = el.querySelector('p.error');
    expect(err).not.toBeNull();
    expect(err!.classList.contains('alert')).toBe(true);
    expect(err!.textContent).toBe('Voting closed at 14:00');
  });
});
