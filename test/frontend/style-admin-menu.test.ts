import { beforeEach, describe, expect, it, vi } from 'vitest';

type Snack = { id: number; name: string; status: string; suggested_by_name?: string | null };

const settle = () => new Promise((r) => setTimeout(r, 0));
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

let suggestions: Snack[];
let snacks: Snack[];
let api: { adminGet: ReturnType<typeof vi.fn>; adminPost: ReturnType<typeof vi.fn>; adminPatch: ReturnType<typeof vi.fn> };
let el: HTMLElement;

const mountMenu = async () => {
  const { mount } = await import('../../public/js/admin/menu.js');
  el = document.createElement('div');
  document.body.replaceChildren(el);
  mount(el, { api });
  await settle();
};
const row = (name: string) =>
  [...el.querySelectorAll('li')].filter((li) => li.textContent!.includes(name)) as HTMLElement[];
const button = (scope: ParentNode, label: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent!.trim().toLowerCase() === label) as HTMLButtonElement;
const click = async (b: HTMLButtonElement) => {
  b.click();
  await settle();
};
const addForm = () => el.querySelector('form') as HTMLFormElement;
const submitAdd = async (name: string) => {
  (addForm().querySelector('input') as HTMLInputElement).value = name;
  addForm().dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  await settle();
};

beforeEach(() => {
  suggestions = [{ id: 7, name: 'Samosa', status: 'pending', suggested_by_name: 'Rina' }];
  snacks = [
    { id: 1, name: 'Chips', status: 'approved' },
    { id: 2, name: 'Cake', status: 'retired' },
    { id: 7, name: 'Samosa', status: 'pending', suggested_by_name: 'Rina' },
  ];
  api = {
    adminGet: vi.fn(async (path: string) => (path === '/admin/suggestions' ? suggestions : snacks)),
    adminPost: vi.fn(async () => ({ id: 9, name: 'x', status: 'approved' })),
    adminPatch: vi.fn(async () => ({ id: 1, name: 'x', status: 'approved' })),
  };
  vi.stubGlobal('prompt', vi.fn(() => null));
});

describe('admin menu styling', () => {
  it('lists carry list and keep suggestions / snacks', async () => {
    await mountMenu();
    for (const cls of ['suggestions', 'snacks']) {
      const ul = el.querySelector(`ul.${cls}`)!;
      expect(ul.classList.contains('list')).toBe(true);
    }
  });

  it('every li is a row', async () => {
    await mountMenu();
    const lis = [...el.querySelectorAll('li')];
    expect(lis.length).toBe(4);
    for (const li of lis) expect(li.classList.contains('row')).toBe(true);
  });

  it('status badge matches the snack status', async () => {
    await mountMenu();
    for (const [name, status] of [['Chips', 'approved'], ['Cake', 'retired'], ['Samosa', 'pending']]) {
      const badge = row(name)[0].querySelector('.badge')!;
      expect(badge.classList.contains(`badge-${status}`)).toBe(true);
      expect(row(name)[0].textContent).toContain(`(${status})`);
    }
  });

  it('Approve is plain, Reject / Rename / Retire are btn-quiet', async () => {
    await mountMenu();
    const sam = row('Samosa').find((r) => button(r, 'approve'))!;
    expect(button(sam, 'approve').classList.contains('btn-quiet')).toBe(false);
    expect(button(sam, 'reject').classList.contains('btn-quiet')).toBe(true);
    const chips = row('Chips')[0];
    expect(button(chips, 'rename').classList.contains('btn-quiet')).toBe(true);
    expect(button(chips, 'retire').classList.contains('btn-quiet')).toBe(true);
  });

  it('add form is a row and the alert paragraph has alert', async () => {
    await mountMenu();
    expect(addForm().classList.contains('row')).toBe(true);
    expect(el.querySelector('[role="alert"]')!.classList.contains('alert')).toBe(true);
  });
});
