import { beforeEach, describe, expect, it, vi } from 'vitest';

const load = async () => ({
  api: await import('../../public/js/api.js'),
  identity: await import('../../public/js/identity.js'),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = vi.fn(async () => json({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: (init ?? {}) as RequestInit };
};
const header = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

describe('getState', () => {
  it('omits the query string when no employee is set', async () => {
    const { api } = await load();
    await api.getState();
    expect(lastCall().url).toBe('/api/state');
  });

  it('appends ?employee=<id> when an employee is set', async () => {
    const { api, identity } = await load();
    identity.setEmployee(7);
    await api.getState();
    expect(lastCall().url).toBe('/api/state?employee=7');
  });

  it('returns the parsed JSON body', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 'open' }));
    const { api } = await load();
    expect(await api.getState()).toEqual({ status: 'open' });
  });
});

describe('error propagation', () => {
  it('rejects with the server message and status on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'closed', message: 'Voting is closed' } }, 403));
    const { api } = await load();
    await expect(api.postVote(1, 2)).rejects.toMatchObject({ message: 'Voting is closed', status: 403 });
  });

  it('is an Error instance and still carries status when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const { api } = await load();
    const err = await api.getHistory().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { status: number }).status).toBe(500);
  });
});

describe('voter endpoints', () => {
  it('getEmployees and getHistory hit the right paths', async () => {
    const { api } = await load();
    await api.getEmployees();
    expect(lastCall().url).toBe('/api/employees');
    await api.getHistory();
    expect(lastCall().url).toBe('/api/history');
  });

  it('postVote sends employee_id and snack_id as JSON', async () => {
    const { api } = await load();
    await api.postVote(3, 9);
    const { url, init } = lastCall();
    expect(url).toBe('/api/vote');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ employee_id: 3, snack_id: 9 });
    expect(header(init, 'content-type')).toContain('application/json');
  });

  it('postSuggestion sends employee_id and name as JSON', async () => {
    const { api } = await load();
    await api.postSuggestion(3, 'Samosa');
    const { url, init } = lastCall();
    expect(url).toBe('/api/suggestions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ employee_id: 3, name: 'Samosa' });
  });

  it('does not send X-Admin-Pin on voter calls', async () => {
    const { api, identity } = await load();
    identity.setPin('1234');
    await api.getEmployees();
    expect(header(lastCall().init, 'x-admin-pin')).toBeNull();
  });
});

describe('admin calls', () => {
  it('send X-Admin-Pin from sessionStorage', async () => {
    const { api, identity } = await load();
    identity.setPin('1234');
    await api.adminGet('/admin/snacks');
    expect(lastCall().url).toBe('/api/admin/snacks');
    expect(header(lastCall().init, 'x-admin-pin')).toBe('1234');
    await api.adminPost('/admin/snacks', { name: 'Chips' });
    expect(lastCall().init.method).toBe('POST');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ name: 'Chips' });
    expect(header(lastCall().init, 'x-admin-pin')).toBe('1234');
    await api.adminPatch('/admin/snacks/4', { status: 'approved' });
    expect(lastCall().init.method).toBe('PATCH');
    expect(header(lastCall().init, 'x-admin-pin')).toBe('1234');
    await api.adminPut('/admin/settings', { cutoff: '14:00' });
    expect(lastCall().init.method).toBe('PUT');
    expect(header(lastCall().init, 'x-admin-pin')).toBe('1234');
  });

  it('propagate a 401 with the server message', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'unauthorized', message: 'Wrong PIN' } }, 401));
    const { api } = await load();
    await expect(api.adminGet('/admin/settings')).rejects.toMatchObject({ message: 'Wrong PIN', status: 401 });
  });
});

describe('identity', () => {
  it('employee survives a fresh module load and clearEmployee removes it', async () => {
    let { identity } = await load();
    identity.setEmployee(5);
    vi.resetModules();
    ({ identity } = await load());
    expect(String(identity.getEmployee())).toBe('5');
    identity.clearEmployee();
    expect(identity.getEmployee()).toBeNull();
    vi.resetModules();
    ({ identity } = await load());
    expect(identity.getEmployee()).toBeNull();
  });

  it('PIN lives only in sessionStorage, never localStorage', async () => {
    const { identity } = await load();
    identity.setPin('s3cret');
    expect(identity.getPin()).toBe('s3cret');
    expect(Object.values(sessionStorage)).toContain('s3cret');
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('s3cret');
    identity.setEmployee(1);
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('s3cret');
    identity.clearPin();
    expect(identity.getPin()).toBeNull();
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
});
