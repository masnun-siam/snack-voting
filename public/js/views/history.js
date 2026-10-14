// View contract: ctx = {employee, state, api, refresh}
// mount(el, ctx) renders into el; update(state) re-renders with new state.
// GET /history entries: {day, winner (name|null), counts: {snackName: n}, method}. No voter data is ever shown.
// All text goes through textContent (never innerHTML), so snack names cannot inject markup.
const METHODS = {
  votes: 'Votes',
  tie_random: 'Random tie pick',
  admin: 'Admin override',
  no_votes: 'No votes',
  skipped: 'Skipped',
};

let el;
let api;
let status;
let seq = 0; // drops responses from a superseded load/mount

const p = (text) => Object.assign(document.createElement('p'), { textContent: text });

const row = ({ day, winner, counts, method }) => {
  const li = document.createElement('li');
  const tallies = Object.entries(counts ?? {}).map(([name, n]) => `${name}: ${n}`).join(', ');
  li.textContent = [day, winner ?? 'No winner', METHODS[method] ?? method, tallies].filter(Boolean).join(' · ');
  return li;
};

async function load() {
  const target = el;
  const mine = ++seq;
  target.replaceChildren(p('Loading…'));
  let out;
  try {
    const days = await api.getHistory();
    if (days.length) {
      out = [Object.assign(document.createElement('h2'), { textContent: 'History' })];
      const ul = document.createElement('ul');
      ul.append(...days.map(row));
      out.push(ul);
    } else {
      out = [p('No decided days yet.')];
    }
  } catch (err) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.onclick = load;
    out = [p(err.message || 'Could not load history.'), retry];
  }
  if (mine === seq) target.replaceChildren(...out);
}

export function mount(target, ctx) {
  el = target;
  api = ctx.api;
  status = ctx.state?.status;
  load();
}

// ponytail: refetch only when the day's status changes (e.g. open -> decided); the 15 s poll leaves history alone.
export function update(state) {
  if (state?.status === status) return;
  status = state?.status;
  load();
}
