// View contract: ctx = {employee, state, api, refresh}
// mount(el, ctx) renders into el; update(state) re-renders with new state.
// All dynamic text goes through textContent (never innerHTML).
let el;
let ctx;
let current;
let message = ''; // server message for the last rejected vote
let busy = false;

const METHOD_NOTE = {
  tie_random: 'random pick among tied snacks',
  admin: 'set by admin',
};

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const node = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};

// Before opening -> "opens at"; otherwise (after cutoff, non-working day) -> "closed".
function closedText(window_) {
  const open = window_?.open_time;
  const now = clockFmt.format(new Date());
  return open && now < open ? `Voting opens at ${open}` : 'Voting is closed';
}

async function vote(snackId) {
  if (busy) return;
  busy = true;
  message = '';
  render(current);
  try {
    await ctx.api.postVote(ctx.employee.id, snackId);
  } catch (err) {
    message = err?.message || 'Your vote could not be saved.';
    busy = false;
    render(current);
    return;
  }
  busy = false;
  await ctx.refresh();
}

function snackList(state) {
  const ul = node('ul');
  for (const s of state.snacks ?? []) {
    const li = node('li');
    li.append(node('span', s.name, 'name'), ' ', node('span', `${s.count} ${s.count === 1 ? 'vote' : 'votes'}`, 'count'));
    if (s.id === state.leader) li.append(' ', node('strong', 'Leader', 'leader'));
    const mine = s.id === state.my_vote;
    if (mine) li.append(' ', node('em', 'Your vote', 'mine'));
    const btn = node('button', 'Vote');
    btn.type = 'button';
    btn.disabled = busy || mine;
    btn.onclick = () => vote(s.id);
    li.append(' ', btn);
    ul.append(li);
  }
  return ul;
}

function decidedNodes(state) {
  const { method, winner } = state.result ?? {};
  if (!winner) {
    return [node('p', method === 'no_votes' ? "No winner today: no votes, admin's choice" : 'No winner has been chosen yet')];
  }
  const note = METHOD_NOTE[method];
  const p = node('p', `Winner: ${winner.name}`, 'winner');
  if (note) p.append(' ', node('span', `(${note})`, 'method'));
  return [p];
}

function render(state) {
  current = state;
  const out = [];
  const status = state?.status;
  if (status === 'skipped') {
    out.push(node('p', 'No snacks today'));
  } else if (status === 'decided') {
    out.push(...decidedNodes(state));
  } else if (status === 'open' || status === 'closed') {
    out.push(node('p', status === 'open' ? `Voting is open until ${state.window?.cutoff_time}` : closedText(state.window)));
    if (state.no_snacks) {
      out.push(node('p', 'Voting is not possible: there are no approved snacks. Admins can add some in the menu.'));
    } else if (status === 'open') {
      out.push(snackList(state));
    }
  } else {
    out.push(node('p', 'Waiting for today’s state…'));
  }
  if (message) {
    const err = node('p', message, 'error');
    err.setAttribute('role', 'alert');
    out.push(err);
  }
  el.replaceChildren(...out);
}

export function mount(target, context) {
  el = target;
  ctx = context;
  message = '';
  busy = false;
  render(ctx.state);
}

export function update(state) {
  render(state);
}
