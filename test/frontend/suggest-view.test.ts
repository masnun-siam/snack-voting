import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, update } from '../../public/js/views/suggest.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

let el: HTMLElement;
const setup = (postSuggestion: any, employee: any = { id: 7, name: 'A' }) => {
  const ctx = { employee, state: {}, api: { postSuggestion }, refresh: vi.fn() };
  mount(el, ctx);
  return ctx;
};
const submit = async (value: string) => {
  const input = el.querySelector('input') as HTMLInputElement;
  input.value = value;
  (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await flush();
};
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

beforeEach(() => {
  el = document.createElement('div');
});

describe('suggest view', () => {
  it('keeps a half-typed name when a state poll calls update', () => {
    setup(vi.fn());
    (el.querySelector('input') as HTMLInputElement).value = 'Chi';
    update({ status: 'open' });
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('Chi');
  });

  it('renders a text input with maxlength 60 when an employee is set', () => {
    setup(vi.fn());
    expect(el.querySelector('input')?.getAttribute('maxlength')).toBe('60');
  });

  it('is hidden without an employee and shows no form', () => {
    setup(vi.fn(), null);
    expect(el.hidden).toBe(true);
    expect(el.querySelector('form')).toBeNull();
  });

  it('posts the trimmed name and shows sent, pending approval', async () => {
    const post = vi.fn().mockResolvedValue({ id: 1 });
    setup(post);
    await submit('  Chips  ');
    expect(post).toHaveBeenCalledExactlyOnceWith(7, 'Chips');
    expect(el.textContent).toMatch(/sent, pending approval/i);
  });

  it('shows the server message on 409', async () => {
    setup(vi.fn().mockRejectedValue(httpError(409, 'Already suggested <b>x</b>')));
    await submit('Chips');
    expect(el.textContent).toContain('Already suggested <b>x</b>');
    expect(el.querySelector('b')).toBeNull();
  });

  it('shows the server message on 429', async () => {
    setup(vi.fn().mockRejectedValue(httpError(429, 'Too many pending suggestions')));
    await submit('Chips');
    expect(el.textContent).toContain('Too many pending suggestions');
  });

  it('blocks empty and whitespace-only input without calling the api', async () => {
    const post = vi.fn();
    setup(post);
    await submit('');
    await submit('   ');
    expect(post).not.toHaveBeenCalled();
    expect(el.textContent).not.toMatch(/sent, pending approval/i);
    expect(el.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('blocks input over 60 characters after trimming', async () => {
    const post = vi.fn();
    setup(post);
    await submit('x'.repeat(61));
    expect(post).not.toHaveBeenCalled();
  });

  it('allows exactly 60 characters', async () => {
    const post = vi.fn().mockResolvedValue({});
    setup(post);
    await submit(' ' + 'x'.repeat(60) + ' ');
    expect(post).toHaveBeenCalledWith(7, 'x'.repeat(60));
  });
});
