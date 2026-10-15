import * as api from './api.js';
import { clearEmployee, getEmployee } from './identity.js';
import * as picker from './views/picker.js';
import * as vote from './views/vote.js';
import * as suggest from './views/suggest.js';
import * as history from './views/history.js';

const POLL_MS = 15000;
const $ = (id) => document.getElementById(id);
const status = $('status');
const views = [
  [picker, 'picker'],
  [vote, 'vote'],
  [suggest, 'suggest'],
  [history, 'history'],
];

let mountedFor; // employee id the views were mounted with (null = none); undefined = not mounted yet
let timer;

function show(state, employees) {
  let employee = employees.find((e) => String(e.id) === getEmployee()) ?? null;
  if (!employee && getEmployee()) clearEmployee(); // deactivated since last visit
  status.replaceChildren();
  status.className = 'card';
  // vote/suggest need an identity; picker and history do not.
  const active = ([, id]) => employee || id === 'picker' || id === 'history';
  if (mountedFor !== undefined && mountedFor === (employee?.id ?? null)) {
    views.filter(active).forEach(([v]) => v.update(state));
  } else {
    mountedFor = employee?.id ?? null;
    const ctx = { employee, employees, state, api, refresh };
    views.forEach(([v, id]) => {
      if (active([v, id])) v.mount($(id), ctx);
      else $(id).replaceChildren();
    });
  }
  // Poll only while open (FR-4).
  if (state.status === 'open' && !timer) timer = setInterval(() => sync().catch(() => {}), POLL_MS);
  if (state.status !== 'open' && timer) timer = clearInterval(timer);
}

async function sync() {
  const [state, employees] = await Promise.all([api.getState(), api.getEmployees()]);
  show(state, employees);
}

function showError(err) {
  const msg = document.createElement('p');
  msg.textContent = err.message || 'Something went wrong.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn-quiet';
  retry.textContent = 'Retry';
  retry.onclick = load;
  status.className = 'card alert error';
  status.replaceChildren(msg, retry);
}

async function load() {
  if (mountedFor === undefined) {
    status.className = 'card muted';
    status.textContent = 'Loading…';
  }
  try {
    await sync();
  } catch (err) {
    showError(err);
  }
}

// Views call this after changing something (pick, vote, suggest).
export const refresh = load;

load();
