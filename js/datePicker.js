// Custom, on-brand month/date pickers that decorate existing native inputs.
// The native <input> stays in the DOM as the single source of truth: we only
// set its .value and dispatch a bubbling 'change', so every existing summary
// listener (refreshOrderSummary etc.) keeps working untouched. We never open
// the browser's native popup — the field is replaced by a themed trigger +
// popover so the whole picker matches the rest of the app.

import { toDateStr } from './dateUtils.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const pad2 = (n) => String(n).padStart(2, '0');

function fmtMonth(v) {
  if (!v) return 'Pick a month';
  const [y, m] = v.split('-').map(Number);
  return `${MONTHS_FULL[m - 1]} ${y}`;
}
function fmtDate(v) {
  if (!v) return 'Pick a date';
  const [y, m, d] = v.split('-').map(Number);
  return `${d}/${m}/${y}`;
}
function commit(input, val) {
  input.value = val;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

let openPop = null;
function closeAll() {
  if (!openPop) return;
  openPop.classList.add('hidden');
  openPop.closest('.dp')?.classList.remove('dp-open');
  openPop = null;
}

export function enhanceDatePickers(root = document) {
  root.querySelectorAll('input[data-picker]').forEach(decorate);
  if (!enhanceDatePickers._bound) {
    enhanceDatePickers._bound = true;
    document.addEventListener('click', (e) => { if (!e.target.closest('.dp')) closeAll(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  }
}

function decorate(input) {
  if (input.closest('.dp')) return; // already decorated
  const type = input.dataset.picker; // 'month' | 'date'
  const wrap = document.createElement('span');
  wrap.className = 'dp';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.classList.add('dp-native');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'dp-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.innerHTML = '<span class="dp-ico" aria-hidden="true">📅</span><span class="dp-txt"></span>';
  wrap.appendChild(trigger);

  const pop = document.createElement('div');
  pop.className = 'dp-pop hidden';
  pop.setAttribute('role', 'dialog');
  wrap.appendChild(pop);

  const view = { y: 0, m: 0 };

  function syncText() {
    trigger.querySelector('.dp-txt').textContent =
      type === 'month' ? fmtMonth(input.value) : fmtDate(input.value);
  }
  function seedView() {
    const v = input.value || toDateStr(new Date());
    const [y, m] = v.split('-').map(Number);
    view.y = y;
    view.m = m;
  }
  function render() {
    pop.innerHTML = type === 'month' ? renderMonth(view, input.value) : renderDate(view, input.value);
  }

  trigger.addEventListener('click', () => {
    const isOpen = !pop.classList.contains('hidden');
    closeAll();
    if (isOpen) return;
    seedView();
    render();
    pop.classList.remove('hidden');
    wrap.classList.add('dp-open');
    openPop = pop;
  });

  pop.addEventListener('click', (e) => {
    // keep the click inside the popover — re-rendering (below) detaches the
    // clicked node, so the bubbling outside-click closer would otherwise treat
    // it as an outside click and shut the popover mid-navigation.
    e.stopPropagation();
    const nav = e.target.closest('[data-nav]');
    if (nav) { stepView(view, type, Number(nav.dataset.nav)); render(); return; }
    if (e.target.closest('.dp-today')) {
      const t = toDateStr(new Date());
      commit(input, type === 'month' ? t.slice(0, 7) : t);
      syncText();
      closeAll();
      return;
    }
    const cell = e.target.closest('.dp-cell');
    if (cell && !cell.classList.contains('dp-empty')) {
      commit(input, type === 'month' ? `${view.y}-${pad2(Number(cell.dataset.m))}` : cell.dataset.date);
      syncText();
      closeAll();
    }
  });

  input.addEventListener('change', syncText); // reflect programmatic/other changes
  syncText();
}

function stepView(view, type, dir) {
  if (type === 'month') { view.y += dir; return; }
  view.m += dir;
  if (view.m < 1) { view.m = 12; view.y -= 1; } else if (view.m > 12) { view.m = 1; view.y += 1; }
}

function head(prevLabel, nextLabel, title) {
  return `<div class="dp-head">
    <button type="button" class="dp-nav" data-nav="-1" aria-label="${prevLabel}">‹</button>
    <span class="dp-title">${title}</span>
    <button type="button" class="dp-nav" data-nav="1" aria-label="${nextLabel}">›</button>
  </div>`;
}

function renderMonth(view, val) {
  const [selY, selM] = val ? val.split('-').map(Number) : [null, null];
  const cells = MONTHS_SHORT.map((mn, i) => {
    const m = i + 1;
    const on = selY === view.y && selM === m;
    return `<button type="button" class="dp-cell${on ? ' is-selected' : ''}" data-m="${m}">${mn}</button>`;
  }).join('');
  return `${head('Previous year', 'Next year', view.y)}
    <div class="dp-grid dp-months">${cells}</div>
    <div class="dp-foot"><button type="button" class="dp-today">This month</button></div>`;
}

function renderDate(view, val) {
  const startDow = (new Date(view.y, view.m - 1, 1).getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const todayStr = toDateStr(new Date());
  let cells = '';
  for (let i = 0; i < startDow; i += 1) cells += '<span class="dp-cell dp-empty"></span>';
  for (let d = 1; d <= daysInMonth; d += 1) {
    const ds = `${view.y}-${pad2(view.m)}-${pad2(d)}`;
    const cls = `dp-cell${val === ds ? ' is-selected' : ''}${todayStr === ds ? ' is-today' : ''}`;
    cells += `<button type="button" class="${cls}" data-date="${ds}">${d}</button>`;
  }
  const wk = WEEKDAYS.map((w) => `<span>${w}</span>`).join('');
  return `${head('Previous month', 'Next month', `${MONTHS_FULL[view.m - 1]} ${view.y}`)}
    <div class="dp-weekdays">${wk}</div>
    <div class="dp-grid dp-days">${cells}</div>
    <div class="dp-foot"><button type="button" class="dp-today">Today</button></div>`;
}
