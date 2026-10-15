// View contract: ctx = {employee, state, api, refresh}
// mount(el, ctx) renders into el; update(state) re-renders with new state.
// Suggest view: propose a snack by name (FR-6). Hidden until an employee is picked.
const MAX = 60;
let el;
let ctx;
let msg = ''; // survives re-render so update(state) doesn't wipe the result
let failed = false; // theme class: .alert for a rejection, .muted otherwise

const show = (status, text, isError) => {
  msg = text;
  failed = isError;
  status.textContent = text; // textContent only: server messages are untrusted
  status.className = isError ? 'alert' : 'muted';
};

const render = () => {
  el.textContent = '';
  el.hidden = !ctx.employee;
  if (!ctx.employee) return;

  const form = document.createElement('form');
  form.className = 'row';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = MAX;
  input.setAttribute('aria-label', 'Snack name');
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Suggest';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  show(status, msg, failed);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name || name.length > MAX) {
      show(status, `Enter a snack name of 1 to ${MAX} characters.`, true);
      return;
    }
    button.disabled = true;
    try {
      await ctx.api.postSuggestion(ctx.employee.id, name);
      show(status, 'Sent, pending approval.', false);
      input.value = '';
    } catch (err) {
      // 409 duplicate / 429 over limit carry the server message
      show(status, err?.message || 'Could not send suggestion.', true);
    }
    button.disabled = false;
  });

  form.append(input, button);
  el.append(form, status);
};

export function mount(target, context) {
  el = target;
  ctx = context;
  msg = '';
  failed = false;
  render();
}

// Doesn't re-render: the form never reads state, and rebuilding it on every poll would wipe a half-typed name.
export function update(state) {
  ctx = { ...ctx, state };
}
