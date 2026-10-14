/*
 * Admin section: employees.
 * Contract: mount(el, ctx) with ctx = {api}.
 *   el  - container element this section renders into
 *   api - the shared API client from public/js/api.js
 * Bulk-add by pasting names (one per line), list all employees (incl. inactive),
 * rename and deactivate/reactivate. Data is rendered with textContent only.
 */
export function mount(el, ctx) {
  const { api } = ctx;
  el.innerHTML =
    '<h2>Employees</h2>' +
    '<form><label>Add employees (one name per line)<br><textarea rows="5" style="width:100%"></textarea></label> ' +
    '<button>Add</button></form>' +
    '<p role="status"></p><p role="alert"></p><ul></ul>';
  const textarea = el.querySelector('textarea');
  const status = el.querySelector('[role="status"]');
  const alert = el.querySelector('[role="alert"]');
  const list = el.querySelector('ul');

  const btn = (label, onClick) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  async function load() {
    try {
      const data = await api.adminGet('/admin/employees');
      list.replaceChildren(...(data?.employees ?? []).map(row));
    } catch (err) {
      alert.textContent = err.message;
    }
  }

  // Run a request, then reload; a failure (e.g. 409 on rename) shows the server message.
  async function act(request) {
    alert.textContent = '';
    try {
      await request();
    } catch (err) {
      alert.textContent = err.message;
      return;
    }
    await load();
  }

  function row(emp) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = emp.active ? emp.name : `${emp.name} (inactive)`;
    const input = document.createElement('input');
    input.value = emp.name;
    input.maxLength = 60;
    li.append(
      name,
      ' ',
      input,
      ' ',
      btn('Rename', () => act(() => api.adminPatch(`/admin/employees/${emp.id}`, { name: input.value }))),
      ' ',
      btn(emp.active ? 'Deactivate' : 'Reactivate', () =>
        act(() => api.adminPatch(`/admin/employees/${emp.id}`, { active: !emp.active })),
      ),
    );
    return li;
  }

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    await act(async () => {
      const res = await api.adminPost('/admin/employees', { names: textarea.value.split('\n') });
      status.textContent = `${res.created} created, ${res.skipped} skipped`;
      textarea.value = '';
    });
  });

  load();
}
