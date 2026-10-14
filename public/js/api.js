import { getEmployee, getPin } from './identity.js';

const BASE = '/api';

export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export function getState() {
  const id = getEmployee();
  return request(id ? `/state?employee=${encodeURIComponent(id)}` : '/state');
}
export const getEmployees = () => request('/employees');
export const getHistory = () => request('/history');
export const postVote = (employee_id, snack_id) => request('/vote', { method: 'POST', body: { employee_id, snack_id } });
export const postSuggestion = (employee_id, name) =>
  request('/suggestions', { method: 'POST', body: { employee_id, name } });

// ponytail: generic admin helpers instead of one function per endpoint; later tasks pass the /admin/* path.
const admin = (method) => (path, body) =>
  request(path, { method, body, headers: { 'X-Admin-Pin': getPin() ?? '' } });
export const adminGet = admin('GET');
export const adminPost = admin('POST');
export const adminPatch = admin('PATCH');
export const adminPut = admin('PUT');
