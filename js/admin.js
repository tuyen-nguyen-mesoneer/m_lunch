import { Api } from './api.js';
import { weekDates, weekdayLabel, formatDate, datesInRange, monthBounds, toDateStr, mondayOf } from './dateUtils.js';
import { escapeHtml, teamIconHtml, trapOverlayFocus } from './domUtils.js';
import { NO_TEAM_LABEL, groupEmployeesByTeam } from './teamGroup.js';
import { showSnackbar } from './snackbar.js';
import { confirmDialog } from './confirmDialog.js';
import { isAdminAuthenticated } from './adminSession.js';
import { enhanceDatePickers } from './datePicker.js';

const state = { weekStart: '', dates: [], employees: [] };
// Monotonically increasing, never reused (even across row removal) — the
// mobile layout reorders cells by day via CSS `order` (see --mobile-order in
// style.css), and only relative order matters, so gaps left by removed rows
// are harmless while a reused/reset counter would risk two rows tying.
let menuRowSeq = 0;
const orderSummary = { mode: 'month' };

const el = {
  adminHero: document.getElementById('adminHero'),
  adminToolbar: document.getElementById('adminToolbar'),
  weekLabel: document.getElementById('weekLabel'),
  content: document.getElementById('content'),

  changeWeekBtn: document.getElementById('changeWeekBtn'),
  changeWeekOverlay: document.getElementById('changeWeekOverlay'),
  changeWeekInput: document.getElementById('changeWeekInput'),
  changeWeekCancel: document.getElementById('changeWeekCancel'),
  changeWeekSubmit: document.getElementById('changeWeekSubmit'),

  menuEditor: document.getElementById('menuEditor'),
  menuEditorHead: document.getElementById('menuEditorHead'),
  menuEditorBody: document.getElementById('menuEditorBody'),
  addRowBtn: document.getElementById('addRowBtn'),
  saveMenuBtn: document.getElementById('saveMenuBtn'),

  summaryModeRow: document.getElementById('summaryModeRow'),
  summaryMonthInput: document.getElementById('summaryMonthInput'),
  summaryRangeInputs: document.getElementById('summaryRangeInputs'),
  summaryRangeFrom: document.getElementById('summaryRangeFrom'),
  summaryRangeTo: document.getElementById('summaryRangeTo'),
  summaryDayInput: document.getElementById('summaryDayInput'),
  summaryStatus: document.getElementById('summaryStatus'),
  summaryResults: document.getElementById('summaryResults'),
  summaryStats: document.getElementById('summaryStats'),
  summaryBars: document.getElementById('summaryBars'),
  summaryEmptyState: document.getElementById('summaryEmptyState'),

  employeesBody: document.getElementById('employeesBody'),
  employeeCountBadge: document.getElementById('employeeCountBadge'),
  employeeList: document.getElementById('employeeList'),
};

function showAdminContent() {
  el.adminHero.classList.remove('hidden');
  el.adminToolbar.classList.remove('hidden');
  el.content.classList.remove('hidden');
  initContent();
}

async function initContent() {
  renderMenuEditorSkeleton();
  renderEmployeeListSkeleton();

  state.weekStart = await Api.ensureCurrentWeek();
  state.dates = weekDates(state.weekStart);
  updateWeekLabel();

  await renderMenuEditor();
  await renderEmployeeList();

  setupChangeWeek();
  el.saveMenuBtn.addEventListener('click', saveAllMenus);
  el.addRowBtn.addEventListener('click', () => { addMenuRow(); focusSaveMenuBtn(); });
  el.menuEditor.addEventListener('paste', onMenuPaste);
  el.menuEditor.addEventListener('click', onMenuRowRemoveClick);
  el.menuEditor.addEventListener('input', (e) => {
    if (e.target.classList.contains('menu-cell')) syncMenuCellTooltip(e.target);
  });
  // Pressing Enter after typing a dish jumps focus to "Save menu" so HR can
  // commit straight from the keyboard — same forced highlight as the
  // add/remove-row actions below, so all three look identical.
  el.menuEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('menu-cell')) {
      e.preventDefault();
      focusSaveMenuBtn();
    }
  });

  setupTabs();
  initOrderSummary();
}

// Section tabs (Menu / Reports / Roster) — show one panel at a time so the
// page isn't a single dense scroll. Pure presentation; no data touched.
const ACTIVE_TAB_KEY = 'mlunch-admin-tab';

function setupTabs() {
  const tabs = Array.from(document.querySelectorAll('.admin-tab'));
  const panels = Array.from(document.querySelectorAll('.admin-panel'));

  function activateTab(name) {
    if (!tabs.some(t => t.dataset.tab === name)) return; // ignore stale/unknown
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
  }

  tabs.forEach(tab => tab.addEventListener('click', () => {
    activateTab(tab.dataset.tab);
    try { localStorage.setItem(ACTIVE_TAB_KEY, tab.dataset.tab); } catch { /* ignore */ }
  }));

  // restore the last-used tab across refreshes (falls back to the HTML default)
  let saved = null;
  try { saved = localStorage.getItem(ACTIVE_TAB_KEY); } catch { /* ignore */ }
  if (saved) activateTab(saved);
}

const SUMMARY_MAX_DAYS = 366;

function initOrderSummary() {
  const today = toDateStr(new Date());
  el.summaryMonthInput.value = today.slice(0, 7);
  el.summaryRangeFrom.value = today;
  el.summaryRangeTo.value = today;
  el.summaryDayInput.value = today;

  el.summaryModeRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.summary-mode-btn');
    if (!btn || btn.dataset.mode === orderSummary.mode) return;
    orderSummary.mode = btn.dataset.mode;
    el.summaryModeRow.querySelectorAll('.summary-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    el.summaryMonthInput.classList.toggle('hidden', orderSummary.mode !== 'month');
    el.summaryRangeInputs.classList.toggle('hidden', orderSummary.mode !== 'range');
    el.summaryDayInput.classList.toggle('hidden', orderSummary.mode !== 'day');
    refreshOrderSummary();
  });

  el.summaryMonthInput.addEventListener('change', refreshOrderSummary);
  el.summaryRangeFrom.addEventListener('change', refreshOrderSummary);
  el.summaryRangeTo.addEventListener('change', refreshOrderSummary);
  el.summaryDayInput.addEventListener('change', refreshOrderSummary);

  // Click a day's bar to expand the actual orders (who ordered what) below
  // it — the bars only ever show counts, this is where you see the detail.
  el.summaryBars.addEventListener('click', (e) => {
    const row = e.target.closest('.summary-bar-row');
    if (row) toggleSummaryDayDetail(row);
  });

  // decorate the native month/date inputs with the custom on-brand picker
  // (after values are set above, so the triggers show the right initial text)
  enhanceDatePickers(el.summaryModeRow.parentElement);

  refreshOrderSummary();
}

// Resolves the active filter mode down to a plain {start, end} date-string
// pair — every mode collapses to this before datesInRange takes over, so
// the fetch/render path below doesn't need to know which mode is active.
function resolveSummaryRange() {
  if (orderSummary.mode === 'month') return monthBounds(el.summaryMonthInput.value);
  if (orderSummary.mode === 'day') return { start: el.summaryDayInput.value, end: el.summaryDayInput.value };
  const from = el.summaryRangeFrom.value;
  const to = el.summaryRangeTo.value;
  return from <= to ? { start: from, end: to } : { start: to, end: from };
}

function showSummaryStatus(message) {
  el.summaryStatus.textContent = message;
  el.summaryStatus.classList.remove('hidden');
  el.summaryResults.classList.add('hidden');
  el.summaryEmptyState.classList.add('hidden');
}

// Weekday → brand color token, so each bar is tinted its own day's hue
// (Sat/Sun fall back to grape). Mon=1 … Fri=5 via Date.getDay().
const WEEKDAY_VARS = ['--grape', '--mon', '--tue', '--wed', '--thu', '--fri', '--grape'];
function dayColorVar(date) {
  return WEEKDAY_VARS[new Date(`${date}T00:00:00`).getDay()] || '--grape';
}

// Cache results per resolved range so flipping modes / revisiting a range is
// instant and doesn't re-hit Firestore.
const summaryCache = new Map();
let summaryReqId = 0;

// Per-day order detail (name + dish) behind each bar — fetched lazily, only
// once, the first time a bar is expanded.
const summaryDayCache = new Map();

async function toggleSummaryDayDetail(row) {
  const { date } = row.dataset;
  const detail = document.getElementById(`summary-detail-${date}`);
  if (!detail) return;
  const expanded = row.getAttribute('aria-expanded') === 'true';
  row.setAttribute('aria-expanded', String(!expanded));
  detail.classList.toggle('hidden', expanded);
  if (expanded || detail.dataset.loaded) return;

  detail.innerHTML = '<p class="summary-detail-status">Loading…</p>';
  let orders = summaryDayCache.get(date);
  if (!orders) {
    try {
      orders = await Api.getOrdersForDate(date);
    } catch (err) {
      detail.innerHTML = '<p class="summary-detail-status">Could not load these orders.</p>';
      return;
    }
    summaryDayCache.set(date, orders);
  }
  detail.dataset.loaded = 'true';
  if (!orders.length) {
    detail.innerHTML = '<p class="summary-detail-status">No orders that day.</p>';
    return;
  }
  const sorted = [...orders].sort((a, b) => a.employee.localeCompare(b.employee));
  detail.innerHTML = sorted.map(o => `
    <div class="summary-detail-row">
      <span class="summary-detail-name">${escapeHtml(o.employee)}</span>
      <span class="summary-detail-dish">${escapeHtml(o.item)}</span>
    </div>
  `).join('');
}

async function refreshOrderSummary() {
  const { start, end } = resolveSummaryRange();
  if (!start || !end) return;

  const dates = datesInRange(start, end);
  if (dates.length > SUMMARY_MAX_DAYS) {
    showSummaryStatus(`That range is too wide (max ${SUMMARY_MAX_DAYS} days). Pick a narrower range.`);
    return;
  }

  const key = `${start}|${end}`;
  const reqId = ++summaryReqId; // guards against out-of-order responses
  let counts = summaryCache.get(key);
  if (!counts) {
    showSummaryStatus('Crunching the numbers…');
    try {
      counts = await Api.getOrderCountsInRange(dates);
    } catch (err) {
      if (reqId === summaryReqId) showSnackbar('Could not load order summary. Please try again.', true);
      return;
    }
    if (reqId !== summaryReqId) return; // a newer request superseded this one
    summaryCache.set(key, counts);
  }

  el.summaryStatus.classList.add('hidden');
  const rows = counts.filter(c => c.count > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) {
    el.summaryResults.classList.add('hidden');
    el.summaryEmptyState.classList.remove('hidden');
    return;
  }

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const busiest = rows.reduce((a, b) => (b.count > a.count ? b : a));
  const maxCount = busiest.count;

  el.summaryStats.innerHTML = `
    ${statTile(total, total === 1 ? 'order' : 'orders', '🍽️')}
    ${statTile(rows.length, rows.length === 1 ? 'day with orders' : 'days with orders', '📅')}
    ${statTile(busiest.count, `busiest — ${weekdayLabel(busiest.date).slice(0, 3)}, ${busiest.date.slice(8, 10)}/${busiest.date.slice(5, 7)}/${busiest.date.slice(0, 4)}`, '🔥')}
  `;
  el.summaryBars.innerHTML = rows.map(({ date, count }) => `
    <div class="summary-bar-group">
      <button type="button" class="summary-bar-row" data-date="${date}" aria-expanded="false"
        style="--bar:var(${dayColorVar(date)}); --bar-deep:var(${dayColorVar(date)}-deep)">
        <span class="summary-bar-label">${weekdayLabel(date).slice(0, 3)}, ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}</span>
        <span class="summary-bar-track">
          <span class="summary-bar-fill" style="width:${Math.max(6, (count / maxCount) * 100)}%"></span>
        </span>
        <span class="summary-bar-count">${count}</span>
      </button>
      <div class="summary-bar-detail hidden" id="summary-detail-${date}"></div>
    </div>
  `).join('');

  el.summaryEmptyState.classList.add('hidden');
  el.summaryResults.classList.remove('hidden');
}

function statTile(value, label, icon) {
  return `<div class="stat-tile">
    <span class="stat-tile-icon" aria-hidden="true">${icon}</span>
    <span class="stat-tile-body">
      <span class="stat-tile-value">${value}</span>
      <span class="stat-tile-label">${label}</span>
    </span>
  </div>`;
}

const MIN_MENU_ROWS = 6;
const WEEKDAY_COUNT = 5;

function updateWeekLabel() {
  el.weekLabel.textContent = `${formatDate(state.dates[0])} – ${formatDate(state.dates[4])}`;
}

// Lets an admin manually point the app at a different Monday-starting week —
// e.g. to prep next week's menu early, or fix drift — without waiting for
// (or being at the mercy of) the automatic Friday-cutoff rollover.
function setupChangeWeek() {
  enhanceDatePickers(el.changeWeekOverlay);
  el.changeWeekBtn.addEventListener('click', () => {
    el.changeWeekInput.value = state.weekStart;
    el.changeWeekInput.dispatchEvent(new Event('change', { bubbles: true }));
    el.changeWeekOverlay.classList.remove('hidden');
    releaseChangeWeekFocusTrap = trapOverlayFocus(el.changeWeekOverlay);
  });
  el.changeWeekCancel.addEventListener('click', closeChangeWeek);
  el.changeWeekOverlay.addEventListener('click', (e) => { if (e.target === el.changeWeekOverlay) closeChangeWeek(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.changeWeekOverlay.classList.contains('hidden')) closeChangeWeek();
  });
  el.changeWeekSubmit.addEventListener('click', submitChangeWeek);
}

let releaseChangeWeekFocusTrap = null;

function closeChangeWeek() {
  el.changeWeekOverlay.classList.add('hidden');
  releaseChangeWeekFocusTrap?.();
}

async function submitChangeWeek() {
  const picked = el.changeWeekInput.value;
  if (!picked) {
    showSnackbar('Please select a day.', true);
    return;
  }
  const weekStart = toDateStr(mondayOf(new Date(`${picked}T00:00:00`)));
  el.changeWeekSubmit.disabled = true;
  try {
    state.weekStart = await Api.setCurrentWeek(weekStart);
    state.dates = weekDates(state.weekStart);
    updateWeekLabel();
    await renderMenuEditor();
    closeChangeWeek();
    showSnackbar(`Now showing the week of <strong>${escapeHtml(formatDate(state.dates[0]))}</strong>.`);
  } catch (err) {
    showSnackbar('Could not change the week. Please try again.', true);
  } finally {
    el.changeWeekSubmit.disabled = false;
  }
}

function renderMenuEditorSkeleton() {
  el.menuEditorHead.innerHTML = `<tr>${Array.from({ length: WEEKDAY_COUNT }).map(() => '<th class="skeleton">&nbsp;</th>').join('')}<th class="menu-row-actions-head"></th></tr>`;
  el.menuEditorBody.innerHTML = Array.from({ length: MIN_MENU_ROWS }).map(() => `
    <tr>${Array.from({ length: WEEKDAY_COUNT }).map(() => '<td><div class="menu-cell skeleton">&nbsp;</div></td>').join('')}<td></td></tr>
  `).join('');
}

function renderEmployeeListSkeleton() {
  // Otherwise the count badge sits empty next to the expand chevron until
  // renderEmployeeList() fills it in, reading as a stray shape rather than
  // a loading state.
  el.employeeCountBadge.className = 'day-total skeleton skeleton-total-chip';
  el.employeeCountBadge.textContent = '';

  el.employeeList.innerHTML = Array.from({ length: 2 }).map(() => `
    <div class="team-group">
      <span class="skeleton skeleton-team-row"></span>
      ${Array.from({ length: 3 }).map(() => '<span class="skeleton skeleton-employee-card"></span>').join('')}
    </div>
  `).join('');
}

async function renderMenuEditor() {
  el.menuEditorHead.innerHTML = `<tr>${state.dates
    .map(date => `<th>${weekdayLabel(date)}, ${date.slice(8, 10)}/${date.slice(5, 7)}</th>`)
    .join('')}<th class="menu-row-actions-head"></th></tr>`;
  el.menuEditorBody.innerHTML = '';
  menuRowSeq = 0;

  const columns = await Promise.all(state.dates.map(date => Api.getMenu(date)));
  // Exactly as many rows as whatever's actually saved (not a fixed floor of
  // 6, and no extra blank row) — otherwise removing rows just gets padded
  // back up on the next load, making the remove button look like it did
  // nothing. "Add row" covers adding more.
  const rowCount = Math.max(1, ...columns.map(items => items.length));
  for (let r = 0; r < rowCount; r++) {
    addMenuRow(columns.map(items => items[r]?.item || ''));
  }
}

// A plain input can't render ::before/::after (browsers don't generate
// pseudo-elements on replaced/form elements), so the instant tooltip lives
// on this wrapper div instead, kept in sync with the input's current value.
function syncMenuCellTooltip(input) {
  const wrap = input.closest('.menu-cell-wrap');
  if (!wrap) return;
  const value = input.value.trim();
  if (value) wrap.setAttribute('data-tooltip', value);
  else wrap.removeAttribute('data-tooltip');
}

// A real <tr> per row — the remove button is just its own <td> outside the
// 5 day columns, no lockstep bookkeeping needed to keep columns in sync
// (that's what fighting a CSS-grid-of-independent-columns layout required;
// a table gets row alignment for free).
function addMenuRow(values = []) {
  const tr = document.createElement('tr');
  // Each cell's --mobile-order groups it with the rest of its own weekday
  // (see the <768px rules in style.css) instead of the table's natural
  // row-major DOM order — column dominates the value so every Monday cell
  // sorts before every Tuesday cell. The row-remove control (below) is
  // hidden at that width instead of joining this order: it deletes the
  // whole row across all 5 days at once, which stopped mapping to anything
  // sensible once the days are visually split apart into their own groups —
  // clearing a single day's text input is the mobile equivalent.
  const seq = menuRowSeq++;
  for (let col = 0; col < WEEKDAY_COUNT; col++) {
    const td = document.createElement('td');
    const date = state.dates[col];
    if (date) td.setAttribute('data-day', `${weekdayLabel(date).slice(0, 3).toUpperCase()} ${date.slice(8, 10)}/${date.slice(5, 7)}`);
    td.style.setProperty('--mobile-order', col * 1000 + seq);
    const wrap = document.createElement('div');
    wrap.className = 'menu-cell-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'menu-cell';
    input.placeholder = 'Dish…';
    input.value = values[col] || '';
    wrap.appendChild(input);
    td.appendChild(wrap);
    tr.appendChild(td);
    syncMenuCellTooltip(input);
  }

  const actionsTd = document.createElement('td');
  actionsTd.className = 'menu-row-actions';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'menu-row-remove';
  removeBtn.setAttribute('data-tooltip', 'Remove this row');
  removeBtn.innerHTML = '<span class="menu-row-remove-icon"></span>';
  actionsTd.appendChild(removeBtn);
  tr.appendChild(actionsTd);

  el.menuEditorBody.appendChild(tr);
}

function onMenuRowRemoveClick(e) {
  const btn = e.target.closest('.menu-row-remove');
  if (!btn) return;
  btn.closest('tr').remove();
  focusSaveMenuBtn();
}

// Focusing "Save menu" alone gives no visible feedback: the button may be
// scrolled out of view, and browsers only show :focus-visible's ring for
// keyboard-driven focus — a .focus() call made from a mouse-click handler
// usually doesn't qualify, so the focus was real but invisible. Scroll it
// into view and force a visible highlight via a dedicated class instead of
// relying on :focus-visible.
let saveMenuHighlightTimer = null;
function focusSaveMenuBtn() {
  el.saveMenuBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.saveMenuBtn.focus({ preventScroll: true });
  el.saveMenuBtn.classList.add('save-menu-highlight');
  clearTimeout(saveMenuHighlightTimer);
  saveMenuHighlightTimer = setTimeout(() => el.saveMenuBtn.classList.remove('save-menu-highlight'), 1600);
}

// Lets HR select+copy a Mon–Fri range (or any sub-range) straight out of a
// Google Sheet and paste it into any cell here — fills the grid starting at
// the pasted-into cell, adding rows as needed.
function onMenuPaste(e) {
  const target = e.target;
  if (!target.classList || !target.classList.contains('menu-cell')) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text || !/[\t\n]/.test(text)) return; // plain single-value paste: let the browser handle it

  e.preventDefault();
  const lines = text.replace(/\r/g, '').split('\n').filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''));
  const startTr = target.closest('tr');
  const startRow = Array.from(el.menuEditorBody.children).indexOf(startTr);
  const startCol = Array.from(startTr.children).findIndex(td => td.contains(target));

  lines.forEach((line, rOffset) => {
    const rowIndex = startRow + rOffset;
    while (rowIndex >= el.menuEditorBody.children.length) addMenuRow();
    const tr = el.menuEditorBody.children[rowIndex];
    line.split('\t').forEach((value, cOffset) => {
      const colIndex = startCol + cOffset;
      if (colIndex >= state.dates.length) return;
      const input = tr.children[colIndex]?.querySelector('.menu-cell');
      if (input) {
        input.value = value.trim();
        syncMenuCellTooltip(input);
      }
    });
  });
}

async function saveAllMenus() {
  el.saveMenuBtn.disabled = true;
  try {
    const rows = Array.from(el.menuEditorBody.querySelectorAll('tr'));
    // The dishes each day will have after this save.
    const itemsByCol = state.dates.map((_, col) => rows
      .map(tr => tr.children[col].querySelector('.menu-cell').value.trim())
      .filter(Boolean));

    // Anyone who already ordered a dish that's being removed from that day
    // would be left pointing at a dish no longer on the menu. Warn first and
    // list exactly who's affected, so HR deletes with eyes open.
    const impacted = await findImpactedOrders(itemsByCol);
    if (impacted.length && !(await confirmMenuImpact(impacted))) {
      el.saveMenuBtn.disabled = false;
      return;
    }

    for (let col = 0; col < state.dates.length; col++) {
      await Api.setMenu(state.dates[col], itemsByCol[col].map(item => ({ item })));
    }
    // Removing a dish also removes the now-orphaned orders for it, so members
    // aren't left holding an order for a dish that no longer exists.
    await Promise.all(impacted.map(o => Api.removeOrder(o.date, o.employee)));
    const removedNote = impacted.length ? ` Removed ${impacted.length} affected order${impacted.length === 1 ? '' : 's'}.` : '';
    showSnackbar(`Saved this week's menu.${removedNote}`, false);
  } catch (err) {
    showSnackbar('Save failed. Please try again.', true);
  } finally {
    el.saveMenuBtn.disabled = false;
  }
}

// Orders for a dish that is being REMOVED from the menu by this save — i.e. a
// dish that was on the saved menu but won't be after. Adding new dishes (or any
// change that doesn't drop a currently-menued dish) impacts nobody.
async function findImpactedOrders(itemsByCol) {
  const [ordersByDate, savedMenus] = await Promise.all([
    Promise.all(state.dates.map(d => Api.getOrdersForDate(d))),
    Promise.all(state.dates.map(d => Api.getMenu(d))),
  ]);
  const impacted = [];
  state.dates.forEach((date, col) => {
    const stillOnMenu = new Set(itemsByCol[col]);
    // dishes on the menu before this save that are gone after it
    const removed = new Set(savedMenus[col].map(m => m.item).filter(item => !stillOnMenu.has(item)));
    if (!removed.size) return;
    ordersByDate[col].forEach(o => {
      if (o.item && removed.has(o.item)) impacted.push({ date, employee: o.employee, item: o.item });
    });
  });
  return impacted;
}

async function confirmMenuImpact(impacted) {
  const MAX_SHOWN = 12;
  const shown = impacted.slice(0, MAX_SHOWN);
  const lines = shown.map(o => `• ${o.employee} — ${o.item} (${weekdayLabel(o.date).slice(0, 3)})`);
  const linesHtml = shown.map(o => `• <strong>${escapeHtml(o.employee)}</strong> — ${escapeHtml(o.item)} (${escapeHtml(weekdayLabel(o.date).slice(0, 3))})`);
  if (impacted.length > MAX_SHOWN) {
    const more = `…and ${impacted.length - MAX_SHOWN} more`;
    lines.push(more); linesHtml.push(more);
  }
  const people = new Set(impacted.map(o => o.employee)).size;
  const orderStr = `${impacted.length} existing order${impacted.length === 1 ? '' : 's'}`;
  const peopleStr = `${people} ${people === 1 ? 'person' : 'people'}`;
  const message = `${orderStr} from ${peopleStr} will be left without a menu dish:\n\n${lines.join('\n')}\n\nSave the menu anyway?`;
  const messageHtml = `<strong>${orderStr}</strong> from <strong>${peopleStr}</strong> will be left without a menu dish:\n\n${linesHtml.join('\n')}\n\nSave the menu anyway?`;
  return confirmDialog(message, { danger: true, messageHtml });
}

// "team Unassigned" reads oddly — Unassigned isn't really a team, just the
// fallback bucket, so phrase it without the word "team" in that one case.
function teamPhrase(team) {
  return team === NO_TEAM_LABEL ? team : `team ${team}`;
}

// Snackbar messages render as HTML (see showSnackbar) so the team name can
// be emphasized in <strong> instead of teamPhrase()'s plain-text quoting.
function teamPhraseHtml(team) {
  const name = `<strong>${escapeHtml(team)}</strong>`;
  return team === NO_TEAM_LABEL ? name : `team ${name}`;
}

// Names must be unique across the whole roster (not just within a team) —
// duplicates make orders/report rows ambiguous. Case-insensitive so "Duc" and
// "duc" collide. Pass exceptId to let a rename keep its own current name.
function isDuplicateName(name, exceptId = null) {
  const norm = name.trim().toLowerCase();
  return state.employees.some(e => e.id !== exceptId && e.name.trim().toLowerCase() === norm);
}

// Avatar shows the employee's initial.
function initials(name) {
  return escapeHtml((name || '').trim().charAt(0).toUpperCase() || '?');
}

async function renderEmployeeList() {
  state.employees = await Api.getEmployees();

  const { byTeam, teams } = groupEmployeesByTeam(state.employees);

  // Unassigned isn't a real team, just the fallback bucket for employees
  // without one — excluded from the team count so it reflects actual teams.
  const teamCount = teams.filter(t => t !== NO_TEAM_LABEL).length;
  const peopleCount = state.employees.length;
  el.employeeCountBadge.className = 'day-total';
  el.employeeCountBadge.textContent =
    `${teamCount} team${teamCount === 1 ? '' : 's'} · ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`;

  el.employeeList.innerHTML = (teams.length ? teams.map(team => `
    <div class="team-group" data-team="${escapeHtml(team)}">
      <div class="team-row team-row-header">
        <span class="team-row-label">${teamIconHtml()}${escapeHtml(team)}</span>
        <span class="team-row-count" data-count="${byTeam.get(team).length}">${byTeam.get(team).length}</span>
        ${team !== NO_TEAM_LABEL ? `<button type="button" class="removeTeamBtn" data-team="${escapeHtml(team)}" aria-label="Remove team ${escapeHtml(team)}" data-tooltip="Remove team ${escapeHtml(team)}">−</button>` : ''}
      </div>
      ${byTeam.get(team).map(e => `
        <div class="employee-card" data-id="${e.id}" data-tooltip="Double-click or press Enter to rename">
          <span class="employee-avatar">${initials(e.name)}</span>
          <span class="employee-card-name" tabindex="0" role="button" aria-label="Rename ${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
          <button type="button" class="removeBtn" data-id="${e.id}" aria-label="Remove ${escapeHtml(e.name)}" data-tooltip="Remove ${escapeHtml(e.name)}">✕</button>
        </div>
      `).join('')}
      <button type="button" class="employee-card employee-card-add" data-team="${escapeHtml(team)}" data-tooltip="Add to ${escapeHtml(team)}">Add member</button>
    </div>
  `).join('') : '<p class="status">No employees yet.</p>')
    + '<button type="button" class="secondary new-team-add" id="newTeamAddBtn">New team</button>';

  el.employeeList.querySelectorAll('.removeBtn').forEach(btn => {
    btn.addEventListener('click', () => removeEmployee(btn.dataset.id));
  });
  el.employeeList.querySelectorAll('.removeTeamBtn').forEach(btn => {
    btn.addEventListener('click', () => removeTeam(btn.dataset.team));
  });
  el.employeeList.querySelectorAll('.employee-card-add').forEach(btn => {
    btn.addEventListener('click', () => showInlineAddInput(btn));
  });
  el.employeeList.querySelectorAll('.employee-card-name').forEach(span => {
    span.addEventListener('dblclick', () => startInlineRename(span));
    span.addEventListener('keydown', (e) => {
      if (span.classList.contains('editing')) return; // let Enter/Space type normally while editing
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startInlineRename(span); }
    });
  });
  document.getElementById('newTeamAddBtn').addEventListener('click', showNewTeamForm);
}

// Click a name to rename it in place — makes the span itself editable
// (contenteditable) rather than swapping in a separate <input>, so the
// card's height/border can't shift: it's the exact same element/box the
// whole time, just briefly editable. Same commit-on-Enter/blur /
// cancel-on-Escape pattern as the inline add.
function startInlineRename(nameSpan) {
  const card = nameSpan.closest('.employee-card');
  const id = card.dataset.id;
  const originalName = nameSpan.textContent;

  nameSpan.contentEditable = 'true';
  nameSpan.spellcheck = false;
  nameSpan.translate = false;
  nameSpan.classList.add('editing');
  nameSpan.removeAttribute('role'); // it's a textbox while editing, not a button
  nameSpan.focus();
  // Caret placed at the end rather than selecting all — an active text
  // selection is what makes Chrome (and any translate extension) pop up its
  // "translate selection" bubble over the card.
  const range = document.createRange();
  range.selectNodeContents(nameSpan);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    document.removeEventListener('mousedown', onRemovePress, true);
    nameSpan.contentEditable = 'false';
    nameSpan.classList.remove('editing');
    const newName = nameSpan.textContent.trim();
    if (commit && newName && newName !== originalName && isDuplicateName(newName, id)) {
      showSnackbar(`<strong>${escapeHtml(newName)}</strong> is already on the roster. Names must be unique.`, true);
      await renderEmployeeList();
      return;
    }
    if (commit && newName && newName !== originalName) {
      const ok = await confirmDialog(`Rename "${originalName}" to "${newName}"?`, {
        messageHtml: `Rename <strong>${escapeHtml(originalName)}</strong> to <strong>${escapeHtml(newName)}</strong>?`,
      });
      if (ok) {
        try {
          await Api.updateEmployeeName(id, newName);
          showSnackbar(`Renamed <strong>${escapeHtml(originalName)}</strong> to <strong>${escapeHtml(newName)}</strong>.`);
        } catch (err) {
          showSnackbar('Could not rename employee. Please try again.', true);
        }
      }
    }
    await renderEmployeeList();
  };
  nameSpan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  nameSpan.addEventListener('blur', () => finish(true));
  // If the user clicks this card's remove ✕ while editing, they mean to delete
  // the person — abandon the rename (mousedown fires before the blur→commit) so
  // only the remove confirm shows, not a rename dialog on top of it.
  const onRemovePress = (e) => {
    if (e.target.closest('.removeBtn') && e.target.closest('.employee-card') === card) {
      finish(false);
    }
  };
  document.addEventListener('mousedown', onRemovePress, true);
}

// Inline add-to-team affordance: the "+" swaps itself for a text input right
// in that team's card row, so adding someone to an already-shown team is one
// click instead of scrolling elsewhere. Creating a brand-new team (one with
// no members yet, so no card exists to add a "+" to) is showNewTeamForm's job.
function showInlineAddInput(addBtn) {
  const team = addBtn.dataset.team;
  const wrapper = document.createElement('div');
  wrapper.className = 'combobox employee-add-combobox';
  wrapper.innerHTML = `
    <input type="text" class="employee-add-input" placeholder="Name" autocomplete="off">
    <button type="button" class="combobox-clear hidden" aria-label="Clear name"></button>
  `;
  addBtn.replaceWith(wrapper);
  const input = wrapper.querySelector('input');
  const clearBtn = wrapper.querySelector('.combobox-clear');
  input.focus();

  const updateClearBtn = () => clearBtn.classList.toggle('hidden', !input.value);
  input.addEventListener('input', updateClearBtn);
  // mousedown only stops the input's blur handler firing first on a mouse
  // click; the clear itself runs on 'click' so Enter/Space (keyboard
  // activation) — which never dispatches mousedown — also triggers it.
  clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  clearBtn.addEventListener('click', () => {
    input.value = '';
    updateClearBtn();
    input.focus();
  });

  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (commit && name && isDuplicateName(name)) {
      showSnackbar(`<strong>${escapeHtml(name)}</strong> is already on the roster. Names must be unique.`, true);
      await renderEmployeeList();
      return;
    }
    if (commit && name) {
      const ok = await confirmDialog(`Add "${name}" to ${teamPhrase(team)}?`, {
        messageHtml: `Add <strong>${escapeHtml(name)}</strong> to ${teamPhraseHtml(team)}?`,
      });
      if (ok) {
        try {
          await Api.addEmployee(name, team === NO_TEAM_LABEL ? '' : team);
          showSnackbar(`Added <strong>${escapeHtml(name)}</strong> to ${teamPhraseHtml(team)}.`);
        } catch (err) {
          showSnackbar('Could not add employee. Please try again.', true);
        }
      }
    }
    await renderEmployeeList();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// "+ New team" at the end of the roster — teams aren't a separate stored
// entity (see getKnownTeams in teamGroup.js), so creating one just means
// adding its first employee with a team name that isn't in use yet. Two
// inline inputs (team name, employee name) rather than a full modal/form,
// matching the same lightweight inline-reveal pattern as showInlineAddInput.
function showNewTeamForm() {
  const addBtn = document.getElementById('newTeamAddBtn');
  const wrap = document.createElement('div');
  wrap.className = 'new-team-form';
  wrap.innerHTML = `
    <input type="text" class="new-team-name" placeholder="New team name" autocomplete="off">
    <input type="text" class="new-team-employee" placeholder="First employee's name" autocomplete="off">
  `;
  addBtn.replaceWith(wrap);
  const teamInput = wrap.querySelector('.new-team-name');
  const employeeInput = wrap.querySelector('.new-team-employee');
  teamInput.focus();

  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const team = teamInput.value.trim();
    const name = employeeInput.value.trim();
    if (commit && (team || name) && !(team && name)) {
      showSnackbar('A team needs both a name and a first employee to be created.', true);
      await renderEmployeeList();
      return;
    }
    if (commit && team && name && isDuplicateName(name)) {
      showSnackbar(`<strong>${escapeHtml(name)}</strong> is already on the roster. Names must be unique.`, true);
      await renderEmployeeList();
      return;
    }
    if (commit && team && name) {
      const ok = await confirmDialog(`Create team "${team}" and add "${name}"?`, {
        messageHtml: `Create team <strong>${escapeHtml(team)}</strong> and add <strong>${escapeHtml(name)}</strong>?`,
      });
      if (ok) {
        try {
          await Api.addEmployee(name, team);
          showSnackbar(`Created team <strong>${escapeHtml(team)}</strong> and added <strong>${escapeHtml(name)}</strong>.`);
        } catch (err) {
          showSnackbar('Could not create team. Please try again.', true);
        }
      }
    }
    await renderEmployeeList();
  };

  teamInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); employeeInput.focus(); }
    else if (e.key === 'Escape') finish(false);
  });
  employeeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  // focusout (not blur) with a relatedTarget check — commits only once focus
  // leaves the whole two-input widget, not when it just moves from one
  // field to the other inside it.
  wrap.addEventListener('focusout', (e) => {
    if (!wrap.contains(e.relatedTarget)) finish(true);
  });
}

async function removeEmployee(id) {
  const employee = state.employees.find(e => e.id === id);
  const name = employee?.name || 'this employee';
  const team = employee?.team || NO_TEAM_LABEL;
  const ok = await confirmDialog(`Remove "${name}" from ${teamPhrase(team)}?`, {
    danger: true,
    messageHtml: `Remove <strong>${escapeHtml(name)}</strong> from ${teamPhraseHtml(team)}?`,
  });
  if (!ok) return;
  try {
    await Api.removeEmployee(id);
    showSnackbar(`Removed <strong>${escapeHtml(name)}</strong> from ${teamPhraseHtml(team)}.`);
    await renderEmployeeList();
  } catch (err) {
    showSnackbar('Could not remove employee. Please try again.', true);
  }
}

async function removeTeam(team) {
  const members = state.employees.filter(e => (e.team || NO_TEAM_LABEL) === team);
  const count = members.length;
  const ok = await confirmDialog(
    `Remove ${teamPhrase(team)} and ${count} ${count === 1 ? 'person' : 'people'} in it?`,
    {
      danger: true,
      messageHtml: `Remove ${teamPhraseHtml(team)} and <strong>${count} ${count === 1 ? 'person' : 'people'}</strong> in it?`,
    }
  );
  if (!ok) return;
  try {
    await Promise.all(members.map(e => Api.removeEmployee(e.id)));
    showSnackbar(`Removed ${teamPhraseHtml(team)} and ${count} ${count === 1 ? 'person' : 'people'}.`);
    await renderEmployeeList();
  } catch (err) {
    showSnackbar('Could not remove team. Please try again.', true);
  }
}

if (isAdminAuthenticated()) {
  showAdminContent();
} else {
  window.location.replace('login.html');
}
