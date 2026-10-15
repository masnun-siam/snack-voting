import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../public/js/admin/employees.js';

const settle = () => new Promise((r) => setTimeout(r, 0));
const ALICE = { id: 1, name: 'Alice', active: 1 };
const BOB = { id: 2, name: 'Bob', active: 0 };

let el: HTMLElement;
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent!.trim() === label) as HTMLButtonElement;

beforeEach(async () => {
  const api = {
    adminGet: vi.fn(async () => ({ employees: [ALICE, BOB] })),
    adminPost: vi.fn(),
    adminPatch: vi.fn(),
  };
  el = document.createElement('div');
  mount(el, { api });
  await settle();
});

describe('admin employees theme classes (FR-15)', () => {
  it('textarea carries no inline style and the form is a stack', () => {
    expect(el.querySelector('textarea')!.hasAttribute('style')).toBe(false);
    expect(el.querySelector('form')!.classList.contains('stack')).toBe(true);
  });

  it('list and rows use list and row', () => {
    expect(el.querySelector('ul')!.classList.contains('list')).toBe(true);
    const lis = [...el.querySelectorAll('li')];
    expect(lis).toHaveLength(2);
    lis.forEach((li) => expect(li.classList.contains('row')).toBe(true));
  });

  it('active and inactive markers are badges', () => {
    const [a, b] = [...el.querySelectorAll('li')];
    expect(a.querySelector('.badge.badge-approved')).toBeTruthy();
    expect(b.querySelector('.badge.badge-retired')).toBeTruthy();
    expect(b.textContent).toContain('(inactive)');
  });

  it('row buttons are btn-quiet', () => {
    const [a, b] = [...el.querySelectorAll('li')];
    expect(button(a, 'Rename').classList.contains('btn-quiet')).toBe(true);
    expect(button(a, 'Deactivate').classList.contains('btn-quiet')).toBe(true);
    expect(button(b, 'Reactivate').classList.contains('btn-quiet')).toBe(true);
  });

  it('status is muted and alert is an alert', () => {
    expect(el.querySelector('[role="status"]')!.classList.contains('muted')).toBe(true);
    expect(el.querySelector('[role="alert"]')!.classList.contains('alert')).toBe(true);
  });
});
