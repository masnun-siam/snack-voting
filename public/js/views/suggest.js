// View contract: ctx = {employee, state, api, refresh}
// mount(el, ctx) renders into el; update(state) re-renders with new state.
// Suggest view: propose a snack by name (FR-6). Hidden until an employee is picked.
const MAX = 60;
let el;
let ctx;
let msg = ''; // survives re-render so update(state) doesn't wipe the result

const render = () => {
  el.textContent = '';
  el.hidden = !ctx.employee;
  if (!ctx.employee) return;

  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = MAX;
  input.setAttribute('aria-label', 'Snack name');
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Suggest';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = msg; // textContent only: server messages are untrusted

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name || name.length > MAX) {
      msg = `Enter a snack name of 1 to ${MAX} characters.`;
      status.textContent = msg;
      return;
    }
    button.disabled = true;
    try {
      await ctx.api.postSuggestion(ctx.employee.id, name);
      msg = 'Sent, pending approval.';
      input.value = '';
    } catch (err) {
      // 409 duplicate / 429 over limit carry the server message
      msg = err?.message || 'Could not send suggestion.';
    }
    button.disabled = false;
    status.textContent = msg;
  });

  form.append(input, button);
  el.append(form, status);
};

export function mount(target, context) {
  el = target;
  ctx = context;
  msg = '';
  render();
}

export function update(state) {
  ctx = { ...ctx, state };
  render();
}
