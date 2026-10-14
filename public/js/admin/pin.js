/*
 * Admin PIN prompt.
 * Contract: mount(el, ctx) with ctx = {api, onAccept}.
 *   el       - container the form renders into
 *   api      - the shared API client from public/js/api.js
 *   onAccept - called once the server accepts the typed PIN
 * The PIN lives only in sessionStorage (identity.js); a 401 clears it (FR-9).
 */
import { clearPin, setPin } from '../identity.js';

export function mount(el, ctx) {
  el.innerHTML =
    '<form><label>Admin PIN <input type="password" autocomplete="off" required></label> ' +
    '<button>Enter</button></form><p role="alert"></p>';
  const input = el.querySelector('input');
  const alert = el.querySelector('[role="alert"]');
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    alert.textContent = '';
    setPin(input.value);
    try {
      await ctx.api.adminGet('/admin/settings');
    } catch (err) {
      if (err.status === 401) clearPin();
      alert.textContent = err.status === 401 ? 'Wrong PIN, try again.' : 'Could not verify the PIN, try again.';
      return;
    }
    input.value = '';
    ctx.onAccept();
  });
}
