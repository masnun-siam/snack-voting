// View contract: ctx = {employee, state, api, refresh}; main.js also passes ctx.employees (active list).
// mount(el, ctx) renders into el; update(state) re-renders with new state.
import { clearEmployee, setEmployee } from '../identity.js';

const btn = (label, onClick) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.onclick = onClick;
  return b;
};

export function mount(el, { employee, employees, refresh }) {
  el.replaceChildren();
  const p = document.createElement('p');
  if (employee) {
    p.textContent = `Voting as ${employee.name} `;
    p.append(btn('Not you?', () => { clearEmployee(); refresh(); }));
    el.append(p);
  } else if (!employees.length) {
    p.textContent = 'No employees yet. Ask an admin to add some.';
    el.append(p);
  } else {
    p.textContent = 'Who are you?';
    const list = document.createElement('div');
    list.className = 'names';
    list.append(...employees.map((e) => btn(e.name, () => { setEmployee(e.id); refresh(); })));
    el.append(p, list);
  }
}

// ponytail: nothing in the picker depends on day state; main re-mounts it when the employee changes.
export function update() {}
