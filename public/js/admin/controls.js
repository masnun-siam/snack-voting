/*
 * Admin section: controls (FR-10, FR-11).
 * Contract: mount(el, ctx) with ctx = {api}.
 *   el  - container element this section renders into
 *   api - the shared API client from public/js/api.js
 * Settings form (open time, cutoff, working weekdays) plus today's day controls:
 * Skip day before cutoff, Override winner on a decided day.
 * All dynamic text goes through textContent (never innerHTML).
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // ISO weekdays 1-7

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

const alertNode = (msg) => {
  const p = node('p', msg, 'error');
  p.setAttribute('role', 'alert');
  return p;
};

const field = (label, input) => {
  const l = node('label', `${label} `);
  l.append(input);
  return l;
};

export function mount(el, ctx) {
  const { api } = ctx;
  const formBox = node('div'); // not a <form>: a click handler works detached from the document
  const formMsg = node('div');
  const dayBox = node('div');
  el.replaceChildren(node('h2', 'Voting window'), formBox, formMsg, node('h2', 'Today'), dayBox);

  let dayMsg = '';
  let current;

  async function run(fn, show) {
    try {
      await fn();
    } catch (err) {
      show(err?.message || 'Request failed');
      return false;
    }
    return true;
  }

  function renderForm(s) {
    const open = node('input');
    const cutoff = node('input');
    for (const [i, name, v] of [[open, 'open_time', s.open_time], [cutoff, 'cutoff_time', s.cutoff_time]]) {
      i.type = 'time';
      i.name = name;
      i.value = v;
    }
    const days = DAYS.map((d, i) => {
      const cb = node('input');
      cb.type = 'checkbox';
      cb.name = 'working_days';
      cb.value = String(i + 1);
      cb.checked = (s.working_days ?? []).includes(i + 1);
      return { cb, label: field(d, cb) };
    });
    const save = node('button', 'Save settings');
    save.type = 'button';
    save.onclick = async () => {
      const body = {
        open_time: open.value,
        cutoff_time: cutoff.value,
        working_days: days.filter((d) => d.cb.checked).map((d) => Number(d.cb.value)),
      };
      const ok = await run(() => api.adminPut('/admin/settings', body), (m) => formMsg.replaceChildren(alertNode(m)));
      if (ok) {
        formMsg.replaceChildren(node('p', 'Saved'));
        await loadDay(); // a new cutoff can change today's status
      }
    };
    formBox.replaceChildren(field('Opens', open), field('Cutoff', cutoff), ...days.map((d) => d.label), save);
  }

  function renderDay(state) {
    current = state;
    const out = [];
    const { status, day } = state;
    const cutoff = state.window?.cutoff_time;
    if (status === 'skipped') {
      out.push(node('p', 'Today is skipped: no snacks today'));
    } else if (status === 'decided') {
      const { winner, method } = state.result ?? {};
      const suffix = method === 'admin' ? ' (set by admin)' : '';
      out.push(node('p', winner ? `Winner: ${winner.name}${suffix}` : 'No winner: no votes'));
      const select = node('select');
      for (const s of state.snacks ?? []) {
        const o = node('option', s.name);
        o.value = String(s.id);
        select.append(o);
      }
      const btn = node('button', 'Override winner');
      btn.type = 'button';
      btn.onclick = () => act(`/admin/days/${day}/override`, { snack_id: Number(select.value) });
      out.push(select, btn);
    } else {
      out.push(node('p', status === 'open' ? `Voting is open until ${cutoff}` : 'Voting is not open'));
      // Closed after cutoff only happens on an undecided day that is about to be decided: no skip then.
      if (status === 'open' || (cutoff && clockFmt.format(new Date()) < cutoff)) {
        const btn = node('button', 'Skip day');
        btn.type = 'button';
        btn.onclick = () => act(`/admin/days/${day}/skip`);
        out.push(btn);
      }
    }
    if (dayMsg) out.push(alertNode(dayMsg));
    dayBox.replaceChildren(...out);
  }

  async function loadDay() {
    dayMsg = '';
    await run(async () => renderDay(await api.getState()), (m) => dayBox.replaceChildren(alertNode(m)));
  }

  async function act(path, ...body) {
    const ok = await run(() => api.adminPost(path, ...body), (m) => (dayMsg = m));
    if (ok) await loadDay();
    else renderDay(current);
  }

  run(async () => renderForm(await api.adminGet('/admin/settings')), (m) => formMsg.replaceChildren(alertNode(m)));
  loadDay();
}
