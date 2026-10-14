import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, update } from '../../public/js/views/vote.js';

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
const text = () => el.textContent ?? '';
const voteButtons = () => [...el.querySelectorAll('button')].filter((b) => /vote/i.test(b.textContent ?? ''));
const row = (name: string) => [...el.querySelectorAll('li')].find((li) => (li.textContent ?? '').includes(name))!;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => vi.useRealTimers());

describe('closed / skipped states (FR-2, FR-10)', () => {
  it('before opening shows "opens at HH:MM" and no vote buttons', () => {
    vi.setSystemTime(new Date('2026-10-15T02:00:00Z')); // 08:00 Dhaka
    setup(baseState({ status: 'closed' }));
    expect(text()).toContain('opens at 09:00');
    expect(voteButtons()).toHaveLength(0);
  });

  it('after cutoff shows "closed" and no vote buttons', () => {
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z')); // 16:00 Dhaka
    setup(baseState({ status: 'closed' }));
    expect(text().toLowerCase()).toContain('closed');
    expect(text()).not.toContain('opens at');
    expect(voteButtons()).toHaveLength(0);
  });

  it('a skipped day shows "no snacks today" and no vote buttons', () => {
    setup(baseState({ status: 'skipped' }));
    expect(text().toLowerCase()).toContain('no snacks today');
    expect(voteButtons()).toHaveLength(0);
  });
});

describe('open state (FR-2, FR-3, FR-4)', () => {
  it('shows "open until HH:MM" and every snack with its count', () => {
    setup(baseState());
    expect(text()).toContain('open until 14:00');
    expect(row('Chips').textContent).toContain('2');
    expect(row('Samosa').textContent).toContain('5');
    expect(row('Fruit').textContent).toContain('0');
    expect(voteButtons()).toHaveLength(3);
  });

  it('marks the leader and only the leader', () => {
    setup(baseState());
    expect(row('Samosa').textContent!.toLowerCase()).toContain('leader');
    expect(row('Chips').textContent!.toLowerCase()).not.toContain('leader');
    expect(row('Fruit').textContent!.toLowerCase()).not.toContain('leader');
  });

  it('marks the user\'s current vote and only that one', () => {
    setup(baseState({ my_vote: 1 }));
    expect(row('Chips').textContent!.toLowerCase()).toContain('your vote');
    expect(row('Samosa').textContent!.toLowerCase()).not.toContain('your vote');
  });

  it('shows no leader mark when nobody has votes', () => {
    setup(baseState({ leader: null, snacks: snacks.map((s) => ({ ...s, count: 0 })) }));
    expect(text().toLowerCase()).not.toContain('leader');
  });

  it('posts the vote for the employee and snack, then refreshes', async () => {
    setup(baseState());
    row('Fruit').querySelector('button')!.click();
    await flush();
    expect(postVote).toHaveBeenCalledWith(7, 3);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the server message on a rejected vote and does not refresh', async () => {
    setup(baseState());
    postVote.mockRejectedValueOnce(new Error('Voting closed at 14:00'));
    row('Chips').querySelector('button')!.click();
    await flush();
    expect(text()).toContain('Voting closed at 14:00');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('clears an earlier rejection message after a successful vote', async () => {
    setup(baseState());
    postVote.mockRejectedValueOnce(new Error('nope'));
    row('Chips').querySelector('button')!.click();
    await flush();
    expect(text()).toContain('nope');
    row('Chips').querySelector('button')!.click();
    await flush();
    expect(text()).not.toContain('nope');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('re-renders with new state on update', () => {
    setup(baseState());
    update(baseState({ snacks: [{ id: 1, name: 'Chips', count: 9 }], leader: 1 }));
    expect(row('Chips').textContent).toContain('9');
    expect(text()).not.toContain('Samosa');
  });

  it('renders snack names as text, never as HTML', () => {
    setup(baseState({ snacks: [{ id: 1, name: '<img src=x onerror=alert(1)>', count: 1 }], leader: 1 }));
    expect(el.querySelector('img')).toBeNull();
    expect(text()).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('decided state (FR-5, FR-10)', () => {
  const decided = (method: string, winner: unknown) =>
    baseState({ status: 'decided', result: { method, winner, counts: [] } });

  it('shows the winner for a plain votes result, with no method note', () => {
    setup(decided('votes', { id: 2, name: 'Samosa' }));
    expect(text()).toContain('Samosa');
    expect(text().toLowerCase()).not.toContain('random pick');
    expect(text().toLowerCase()).not.toContain('set by admin');
    expect(voteButtons()).toHaveLength(0);
  });

  it('says "random pick among tied snacks" for tie_random', () => {
    setup(decided('tie_random', { id: 1, name: 'Chips' }));
    expect(text()).toContain('Chips');
    expect(text().toLowerCase()).toContain('random pick among tied snacks');
  });

  it('says "set by admin" for an admin override', () => {
    setup(decided('admin', { id: 3, name: 'Fruit' }));
    expect(text()).toContain('Fruit');
    expect(text().toLowerCase()).toContain('set by admin');
  });

  it('says "no votes, admin\'s choice" when there is no winner', () => {
    setup(decided('no_votes', null));
    expect(text().toLowerCase()).toContain("no votes, admin's choice");
  });
});

describe('no approved snacks', () => {
  it('says voting is not possible and points admins to the menu', () => {
    setup(baseState({ snacks: [], leader: null, no_snacks: true }));
    expect(text().toLowerCase()).toContain('not possible');
    expect(text().toLowerCase()).toContain('menu');
    expect(voteButtons()).toHaveLength(0);
  });
});
