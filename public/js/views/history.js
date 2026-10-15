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

const BADGE = {
  votes: 'badge-decided',
  tie_random: 'badge-tie',
  admin: 'badge-admin',
  no_votes: 'badge-novotes',
  skipped: 'badge-skipped',
};

let el;
let api;
let status;
let seq = 0; // drops responses from a superseded load/mount

const p = (text, className) => Object.assign(document.createElement('p'), { textContent: text, className });

const row = ({ day, winner, counts, method }) => {
  const li = document.createElement('li');
  li.className = 'card';
  const badge = Object.assign(document.createElement('span'), {
    className: `badge ${BADGE[method] ?? ''}`.trim(),
    textContent: METHODS[method] ?? method,
  });
  const tallies = Object.entries(counts ?? {}).map(([name, n]) => `${name}: ${n}`).join(', ');
  // ' · ' text nodes keep li.textContent reading "day · winner · label · tallies".
  const parts = [day, winner ?? 'No winner', badge, tallies].filter(Boolean);
  li.append(...parts.flatMap((part, i) => (i ? [' · ', part] : [part])));
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
      ul.className = 'list stack';
      ul.append(...days.map(row));
      out.push(ul);
    } else {
      out = [p('No decided days yet.', 'muted')];
    }
  } catch (err) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn-quiet';
    retry.textContent = 'Retry';
    retry.onclick = load;
    out = [p(err.message || 'Could not load history.', 'alert'), retry];
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
