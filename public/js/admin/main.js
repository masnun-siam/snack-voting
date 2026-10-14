// Admin shell: PIN prompt until the server accepts a PIN, then mount the sections with ctx = {api}.
import * as api from '../api.js';
import { clearPin, getPin } from '../identity.js';
import * as menu from './menu.js';
import * as employees from './employees.js';
import * as controls from './controls.js';
import * as pin from './pin.js';

const $ = (id) => document.getElementById(id);

function unlock() {
  $('pin-prompt').hidden = true;
  $('admin-sections').hidden = false;
  const ctx = { api };
  menu.mount($('menu'), ctx);
  employees.mount($('employees'), ctx);
  controls.mount($('controls'), ctx);
}

function prompt() {
  $('admin-sections').hidden = true;
  $('pin-prompt').hidden = false;
  pin.mount($('pin-prompt'), { api, onAccept: unlock });
}

// A stored PIN (same tab, sessionStorage) is re-validated; anything but success falls back to the prompt.
if (getPin()) {
  api.adminGet('/admin/settings').then(unlock, (err) => {
    if (err.status === 401) clearPin();
    prompt();
  });
} else {
  prompt();
}
