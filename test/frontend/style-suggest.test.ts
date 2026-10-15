import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../public/js/views/suggest.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

let el: HTMLElement;
const setup = (postSuggestion: any) => {
  mount(el, { employee: { id: 7, name: 'A' }, state: {}, api: { postSuggestion }, refresh: vi.fn() });
};
const submit = async (value: string) => {
  (el.querySelector('input') as HTMLInputElement).value = value;
  (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await flush();
};
const status = () => el.querySelector('[role="status"]') as HTMLElement;
const httpError = (s: number, message: string) => Object.assign(new Error(message), { status: s });

beforeEach(() => {
  el = document.createElement('div');
});

describe('suggest view styling', () => {
  it('gives the form the row class', () => {
    setup(vi.fn());
    expect(el.querySelector('form')?.classList.contains('row')).toBe(true);
  });

  it('renders the submit button as a plain themed button with no inline style', () => {
    setup(vi.fn());
    const button = el.querySelector('button') as HTMLButtonElement;
    expect(button.type).toBe('submit');
    expect(button.hasAttribute('style')).toBe(false);
  });

  it('marks the empty status muted, not alert', () => {
    setup(vi.fn());
    expect(status().classList.contains('muted')).toBe(true);
    expect(status().classList.contains('alert')).toBe(false);
  });

  it('keeps the status muted after a successful suggestion', async () => {
    setup(vi.fn().mockResolvedValue({ id: 1 }));
    await submit('Chips');
    expect(status().textContent).toMatch(/sent, pending approval/i);
    expect(status().classList.contains('muted')).toBe(true);
    expect(status().classList.contains('alert')).toBe(false);
  });

  it('marks the status alert after a rejected suggestion (409)', async () => {
    setup(vi.fn().mockRejectedValue(httpError(409, 'Already suggested')));
    await submit('Chips');
    expect(status().textContent).toBe('Already suggested');
    expect(status().classList.contains('alert')).toBe(true);
    expect(status().classList.contains('muted')).toBe(false);
  });

  it('marks the status alert on client-side validation failure', async () => {
    const post = vi.fn();
    setup(post);
    await submit('   ');
    expect(post).not.toHaveBeenCalled();
    expect(status().classList.contains('alert')).toBe(true);
    expect(status().classList.contains('muted')).toBe(false);
  });

  it('returns the status to muted after a success following an error', async () => {
    const post = vi.fn().mockRejectedValueOnce(httpError(409, 'Already suggested')).mockResolvedValueOnce({ id: 2 });
    setup(post);
    await submit('Chips');
    await submit('Nuts');
    expect(status().classList.contains('muted')).toBe(true);
    expect(status().classList.contains('alert')).toBe(false);
  });
});
