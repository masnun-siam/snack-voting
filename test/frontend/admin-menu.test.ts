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
const alertText = () => el.querySelector('[role="alert"]')?.textContent ?? '';

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

describe('admin menu', () => {
  it('loads suggestions and all snacks through ctx.api', async () => {
    await mountMenu();
    expect(api.adminGet).toHaveBeenCalledWith('/admin/suggestions');
    expect(api.adminGet).toHaveBeenCalledWith('/admin/snacks');
  });

  it('lists a pending suggestion with the suggester and Approve / Reject buttons', async () => {
    await mountMenu();
    const li = row('Samosa').find((r) => button(r, 'approve'))!;
    expect(li.textContent).toContain('Rina');
    expect(button(li, 'reject')).toBeTruthy();
  });

  it('lists every snack with its status, Rename and Retire on active ones', async () => {
    await mountMenu();
    const chips = row('Chips')[0];
    expect(chips.textContent).toContain('approved');
    expect(button(chips, 'rename')).toBeTruthy();
    expect(button(chips, 'retire')).toBeTruthy();
  });

  it('approve PATCHes status approved and reloads both lists', async () => {
    await mountMenu();
    const before = api.adminGet.mock.calls.length;
    suggestions = [];
    snacks = snacks.map((s) => (s.id === 7 ? { ...s, status: 'approved' } : s));
    await click(button(row('Samosa').find((r) => button(r, 'approve'))!, 'approve'));
    expect(api.adminPatch).toHaveBeenCalledWith('/admin/snacks/7', { status: 'approved' });
    expect(api.adminGet.mock.calls.length).toBe(before + 2);
    expect(row('Samosa').some((r) => button(r, 'approve'))).toBe(false);
    expect(row('Samosa')[0].textContent).toContain('approved');
  });

  it('reject PATCHes status retired', async () => {
    await mountMenu();
    await click(button(row('Samosa').find((r) => button(r, 'reject'))!, 'reject'));
    expect(api.adminPatch).toHaveBeenCalledWith('/admin/snacks/7', { status: 'retired' });
  });

  it('retire PATCHes status retired for an approved snack', async () => {
    await mountMenu();
    await click(button(row('Chips')[0], 'retire'));
    expect(api.adminPatch).toHaveBeenCalledWith('/admin/snacks/1', { status: 'retired' });
  });

  it('rename PATCHes the prompted name', async () => {
    (window.prompt as ReturnType<typeof vi.fn>).mockReturnValue('Crisps');
    await mountMenu();
    await click(button(row('Chips')[0], 'rename'));
    expect(api.adminPatch).toHaveBeenCalledWith('/admin/snacks/1', { name: 'Crisps' });
  });

  it('rename cancelled sends nothing', async () => {
    await mountMenu();
    await click(button(row('Chips')[0], 'rename'));
    expect(api.adminPatch).not.toHaveBeenCalled();
  });

  it('shows retired snacks as retired, not removed, and without a Retire button', async () => {
    await mountMenu();
    const cake = row('Cake')[0];
    expect(cake).toBeTruthy();
    expect(cake.textContent).toContain('retired');
    expect(button(cake, 'retire')).toBeUndefined();
  });

  it('add form POSTs the name, clears the input and reloads', async () => {
    await mountMenu();
    const before = api.adminGet.mock.calls.length;
    await submitAdd('Popcorn');
    expect(api.adminPost).toHaveBeenCalledWith('/admin/snacks', { name: 'Popcorn' });
    expect((addForm().querySelector('input') as HTMLInputElement).value).toBe('');
    expect(api.adminGet.mock.calls.length).toBe(before + 2);
  });

  it('shows the server message on a duplicate (409) and keeps the typed name', async () => {
    api.adminPost.mockRejectedValue(httpError(409, 'A snack with that name already exists'));
    await mountMenu();
    await submitAdd('Chips');
    expect(alertText()).toContain('A snack with that name already exists');
    expect((addForm().querySelector('input') as HTMLInputElement).value).toBe('Chips');
  });

  it('shows the server message on invalid input (400)', async () => {
    api.adminPost.mockRejectedValue(httpError(400, 'name must be 1-60 characters'));
    await mountMenu();
    await submitAdd('   ');
    expect(alertText()).toContain('name must be 1-60 characters');
  });

  it('shows the server message when an approve is refused', async () => {
    api.adminPatch.mockRejectedValue(httpError(409, 'A snack with that name already exists'));
    await mountMenu();
    await click(button(row('Samosa').find((r) => button(r, 'approve'))!, 'approve'));
    expect(alertText()).toContain('A snack with that name already exists');
  });

  it('escapes snack and suggester names', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    suggestions = [{ id: 8, name: evil, status: 'pending', suggested_by_name: '<b>bob</b>' }];
    snacks = [{ id: 8, name: evil, status: 'pending', suggested_by_name: '<b>bob</b>' }];
    await mountMenu();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toContain(evil);
    expect(el.textContent).toContain('<b>bob</b>');
  });
});
