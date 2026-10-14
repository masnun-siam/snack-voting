// View contract: ctx = {employee, state, api, refresh}
// mount(el, ctx) renders into el; update(state) re-renders with new state.
// Placeholder only; real content lands in a later task.
let el;

const render = (state) => {
  el.textContent = `suggest view (placeholder): ${JSON.stringify(state ?? null)}`;
};

export function mount(target, ctx) {
  el = target;
  render(ctx.state);
}

export function update(state) {
  render(state);
}
