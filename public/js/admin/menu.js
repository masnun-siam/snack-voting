/*
 * Admin section: menu.
 * Contract: mount(el, ctx) with ctx = {api}.
 *   el  - container element this section renders into
 *   api - the shared API client from public/js/api.js
 * Pending suggestions (approve / reject) and every snack (rename / retire), plus an add form (FR-7).
 * Reject = retire; retired snacks stay listed. Server messages on 400/409 show in the alert line.
 * All text goes in via textContent, never innerHTML.
 */
const el_ = (tag, text) => Object.assign(document.createElement(tag), text === undefined ? {} : { textContent: text });

export function mount(el, ctx) {
  const { api } = ctx;
  el.innerHTML =
    '<h3>Suggestions</h3><ul class="suggestions"></ul><h3>All snacks</h3><ul class="snacks"></ul>' +
    '<form><label>New snack <input maxlength="60" required></label> <button>Add</button></form>' +
    '<p role="alert"></p>';
  const [sugList, snackList] = el.querySelectorAll('ul');
  const form = el.querySelector('form');
  const input = form.querySelector('input');
  const alert = el.querySelector('[role="alert"]');

  // Run an action; on success reload both lists, on failure show the server's message.
  async function run(fn) {
    alert.textContent = '';
    try {
      await fn();
      await load();
    } catch (err) {
      alert.textContent = err.message;
      return false;
    }
    return true;
  }
  const patch = (id, body) => run(() => api.adminPatch(`/admin/snacks/${id}`, body));

  const button = (label, onClick) => {
    const b = el_('button', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const item = (s, ...buttons) => {
    const li = el_('li', `${s.name} (${s.status})` + (s.suggested_by_name ? ` - suggested by ${s.suggested_by_name}` : ''));
    li.append(' ', ...buttons);
    return li;
  };

  async function load() {
    const [suggestions, snacks] = await Promise.all([api.adminGet('/admin/suggestions'), api.adminGet('/admin/snacks')]);
    sugList.replaceChildren(
      ...suggestions.map((s) =>
        item(s, button('Approve', () => patch(s.id, { status: 'approved' })), button('Reject', () => patch(s.id, { status: 'retired' }))),
      ),
    );
    snackList.replaceChildren(
      ...snacks.map((s) =>
        item(
          s,
          button('Rename', () => {
            const name = window.prompt('New name', s.name);
            if (name !== null && name.trim() !== '') patch(s.id, { name });
          }),
          ...(s.status === 'retired' ? [] : [button('Retire', () => patch(s.id, { status: 'retired' }))]),
        ),
      ),
    );
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await run(() => api.adminPost('/admin/snacks', { name: input.value }))) input.value = '';
  });

  load().catch((err) => {
    alert.textContent = err.message;
  });
}
