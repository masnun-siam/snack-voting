import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../public/js/admin/employees.js';

const settle = () => new Promise((r) => setTimeout(r, 0));
const ALICE = { id: 1, name: 'Alice', active: 1 };
const BOB = { id: 2, name: 'Bob', active: 0 };

let api: { adminGet: ReturnType<typeof vi.fn>; adminPost: ReturnType<typeof vi.fn>; adminPatch: ReturnType<typeof vi.fn> };
let el: HTMLElement;
let employees: unknown[];

const rows = () => [...el.querySelectorAll('li')];
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent!.trim() === label) as HTMLButtonElement;
const start = async () => {
  mount(el, { api });
  await settle();
};
const addNames = async (text: string) => {
  (el.querySelector('textarea') as HTMLTextAreaElement).value = text;
  el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await settle();
};
const rename = async (row: Element, to: string) => {
  (row.querySelector('input') as HTMLInputElement).value = to;
  button(row, 'Rename').click();
  await settle();
};

beforeEach(() => {
  employees = [ALICE, BOB];
  api = {
    adminGet: vi.fn(async () => ({ employees })),
    adminPost: vi.fn(async () => ({ created: 0, skipped: 0 })),
    adminPatch: vi.fn(async () => ({})),
  };
  el = document.createElement('div');
});

describe('admin employees view', () => {
  it('lists all employees including inactive, from GET /admin/employees', async () => {
    await start();
    expect(api.adminGet).toHaveBeenCalledWith('/admin/employees');
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Alice');
    expect(rows()[1].textContent).toContain('Bob');
    expect(button(rows()[0], 'Deactivate')).toBeTruthy();
    expect(button(rows()[1], 'Reactivate')).toBeTruthy();
  });

  it('posts one name per line as {names}, shows created and skipped counts, and reloads', async () => {
    api.adminPost.mockResolvedValue({ created: 2, skipped: 1 });
    await start();
    await addNames('Carol\n  Dave \n\nAlice\n');
    expect(api.adminPost).toHaveBeenCalledTimes(1);
    const [path, body] = api.adminPost.mock.calls[0];
    expect(path).toBe('/admin/employees');
    expect(body.names.map((n: string) => n.trim()).filter(Boolean)).toEqual(['Carol', 'Dave', 'Alice']);
    expect(el.textContent).toContain('2 created, 1 skipped');
    expect(api.adminGet).toHaveBeenCalledTimes(2);
  });

  it('renames an employee with PATCH {name} and reloads', async () => {
    await start();
    await rename(rows()[0], 'Alicia');
    expect(api.adminPatch).toHaveBeenCalledWith('/admin/employees/1', { name: 'Alicia' });
    expect(api.adminGet).toHaveBeenCalledTimes(2);
  });

  it('deactivates an active employee and reactivates an inactive one', async () => {
    await start();
    button(rows()[0], 'Deactivate').click();
    await settle();
    expect(api.adminPatch).toHaveBeenLastCalledWith('/admin/employees/1', { active: false });
    button(rows()[1], 'Reactivate').click();
    await settle();
    expect(api.adminPatch).toHaveBeenLastCalledWith('/admin/employees/2', { active: true });
    expect(api.adminGet).toHaveBeenCalledTimes(3);
  });

  it('shows the server message on a 409 name conflict', async () => {
    const err = Object.assign(new Error('An employee with that name already exists'), { status: 409 });
    api.adminPatch.mockRejectedValue(err);
    await start();
    await rename(rows()[0], 'Bob');
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('An employee with that name already exists');
  });

  it('renders employee names as text, never as HTML', async () => {
    employees = [{ id: 3, name: '<img src=x onerror=alert(1)>', active: 1 }];
    await start();
    expect(el.querySelector('img')).toBeNull();
    expect(rows()[0].textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
