import { Api } from './api.js';
import { weekDates, weekdayLabel, dayMonthLabel, formatDate, isCutoffPassed, mondayOf, toDateStr } from './dateUtils.js';
import { escapeHtml, trapOverlayFocus } from './domUtils.js';
import { showSnackbar } from './snackbar.js';
import { isAdminAuthenticated } from './adminSession.js';
import { enhanceDatePickers } from './datePicker.js';

const IS_ADMIN = isAdminAuthenticated();

const state = { weekStart: '', dates: [], employee: '', employees: [] };

const el = {
  weekLabel: document.getElementById('weekLabel'),
  changeWeekBtn: document.getElementById('changeWeekBtn'),
  changeWeekOverlay: document.getElementById('changeWeekOverlay'),
  changeWeekInput: document.getElementById('changeWeekInput'),
  changeWeekCancel: document.getElementById('changeWeekCancel'),
  changeWeekSubmit: document.getElementById('changeWeekSubmit'),
  employeeSearch: document.getElementById('employeeSearch'),
  employeeOptions: document.getElementById('employeeOptions'),
  employeeClearBtn: document.getElementById('employeeClearBtn'),
  dayRows: document.getElementById('dayRows'),
  form: document.getElementById('orderForm'),
  submitBtn: document.getElementById('submitBtn'),
  meterFill: document.getElementById('meterFill'),
  meterNum: document.getElementById('meterNum'),
  buddySay: document.getElementById('buddySay'),
};

const WEEKDAY_COUNT = 5;

const SUCCESS_MESSAGE = 'Your order has been saved.';

// "Eat it or MoMo" house rule: shown as a popup on every page load. Closing it
// (button, ✕, backdrop, or Esc) hides it for the session so they can order.
// Acknowledging it via "Continue" flags sessionStorage so it stays dismissed
// for the rest of this browser tab's session (cleared once the tab closes).
const HOUSE_RULE_ACK_KEY = 'mlunch-house-rule-acked';

function setupHouseRule() {
  const overlay = document.getElementById('houseRuleOverlay');
  if (!overlay) return;
  if (sessionStorage.getItem(HOUSE_RULE_ACK_KEY) === '1') return;

  let releaseFocusTrap = null;
  const close = () => {
    overlay.classList.add('hidden');
    document.removeEventListener('keydown', onKey);
    releaseFocusTrap?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  overlay.classList.remove('hidden'); // pop it up on every load
  releaseFocusTrap = trapOverlayFocus(overlay);
  overlay.querySelector('.house-rule-cta')?.addEventListener('click', () => {
    sessionStorage.setItem(HOUSE_RULE_ACK_KEY, '1');
  });
  overlay.querySelectorAll('[data-house-close]').forEach(b => b.addEventListener('click', close));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); }); // backdrop
  document.addEventListener('keydown', onKey);
}

function renderDayRowsSkeleton() {
  el.dayRows.innerHTML = Array.from({ length: WEEKDAY_COUNT }).map(() => `
    <div class="order-row">
      <span class="skeleton skeleton-row-label"></span>
      <div class="day-select disabled">
        <button type="button" class="day-select-trigger skeleton" disabled>&nbsp;</button>
      </div>
    </div>
  `).join('');
}

async function init() {
  setupHouseRule();
  renderDayRowsSkeleton();
  try {
    state.weekStart = await Api.ensureCurrentWeek();
    state.dates = weekDates(state.weekStart);
    el.weekLabel.textContent = `${formatDate(state.dates[0])} – ${formatDate(state.dates[4])}`;

    renderDayRows();
    const employees = await Api.getEmployees();
    state.employees = employees.map(e => e.name).sort((a, b) => a.localeCompare(b));
    await loadMenus();
    updateDaySelectsAvailability();

    setupCombobox();
    setupChangeWeek();
    el.form.addEventListener('submit', onSubmit);
  } catch (err) {
    showSnackbar('Could not load data. Please try again.', true);
  }
}

// Lets an admin manually point the order page at a different Monday-starting
// week (e.g. to open ordering for next week early), same override as the
// admin panel's — it's the same shared config/currentWeek doc.
function setupChangeWeek() {
  if (!IS_ADMIN || !el.changeWeekBtn) return;
  el.changeWeekBtn.classList.remove('hidden');
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
    el.weekLabel.textContent = `${formatDate(state.dates[0])} – ${formatDate(state.dates[4])}`;
    renderDayRows();
    await loadMenus();
    if (state.employee) await selectEmployee(state.employee);
    else updateDaySelectsAvailability();
    closeChangeWeek();
    showSnackbar(`Now showing the week of <strong>${escapeHtml(formatDate(state.dates[0]))}</strong>.`);
  } catch (err) {
    showSnackbar('Could not change the week. Please try again.', true);
  } finally {
    el.changeWeekSubmit.disabled = false;
  }
}

function renderDayRows() {
  el.dayRows.innerHTML = '';
  state.dates.forEach(date => {
    const locked = isCutoffPassed(date);
    const row = document.createElement('div');
    row.className = 'order-row' + (locked ? ' locked' : '');
    row.dataset.date = date;
    row.innerHTML = `
      <span class="row-label"><span class="rl-day">${weekdayLabel(date).slice(0, 3).toUpperCase()}, ${dayMonthLabel(date)}</span></span>
      <div class="day-select disabled" data-date="${date}" data-locked="${locked}" data-has-menu="false">
        <button type="button" class="day-select-trigger placeholder" disabled>${locked ? 'Ordering closed' : 'Not ordered yet'}</button>
        <div class="combobox-list hidden"></div>
      </div>
    `;
    el.dayRows.appendChild(row);
  });
  setupDaySelects();
  el.dayRows.querySelectorAll('.day-select-trigger').forEach(trigger => {
    enhanceDaySelectA11y(trigger, trigger.closest('.day-select').querySelector('.combobox-list'));
  });
}

// Keyboard operability for the per-day dish picker: ↓/↑ move a highlight,
// Enter/Space picks the highlighted dish (reusing its click handler),
// Escape closes, and typing a letter jumps to the next dish starting with
// it — same as a native <select>, useful once a day's menu has several
// dishes. Mirrors orders.js's enhanceFilterA11y for the report's filters.
function enhanceDaySelectA11y(trigger, list) {
  let active = -1;
  const opts = () => [...list.querySelectorAll('.combobox-option')];
  const isOpen = () => !list.classList.contains('hidden');
  const tag = () => opts().forEach((o, i) => { if (!o.id) o.id = `${trigger.closest('.day-select').dataset.date}-opt-${i}`; });
  const setActive = (i) => {
    const o = opts();
    if (!o.length) { active = -1; return; }
    active = (i + o.length) % o.length;
    o.forEach((el2, idx) => el2.classList.toggle('combobox-option-active', idx === active));
    o[active].scrollIntoView({ block: 'nearest' });
  };
  let typeaheadBuffer = '';
  let typeaheadTimer = null;
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { trigger.click(); setTimeout(() => { tag(); setActive(e.key === 'ArrowDown' ? 0 : opts().length - 1); }, 0); return; }
      tag(); setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if ((e.key === 'Enter' || e.key === ' ') && isOpen() && active >= 0) {
      e.preventDefault();
      opts()[active]?.click();
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      list.classList.add('hidden');
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!isOpen()) { trigger.click(); setTimeout(() => tag(), 0); }
      else tag();
      clearTimeout(typeaheadTimer);
      typeaheadBuffer += e.key.toLowerCase();
      typeaheadTimer = setTimeout(() => { typeaheadBuffer = ''; }, 700);
      const o = opts();
      if (!o.length) return;
      const label = (el2) => (el2.textContent || '').trim().replace(/^[^a-z0-9]+/i, '').toLowerCase();
      const repeatingSingleLetter = typeaheadBuffer.length > 1 && [...typeaheadBuffer].every(c => c === typeaheadBuffer[0]);
      const query = repeatingSingleLetter ? typeaheadBuffer[0] : typeaheadBuffer;
      const startIdx = repeatingSingleLetter ? (active + 1) % o.length : 0;
      const order = [...Array(o.length).keys()].map(i => (startIdx + i) % o.length);
      const match = order.find(i => label(o[i]).startsWith(query));
      if (match != null) setActive(match);
    }
  });
}

async function loadMenus() {
  await Promise.all(state.dates.map(async date => {
    const row = el.dayRows.querySelector(`[data-date="${date}"]`);
    const daySelect = row.querySelector('.day-select');
    const items = await Api.getMenu(date);
    // On a locked day the picker is read-only, so an actionable prompt would
    // invite an impossible action — show "Ordering closed" instead (a
    // pre-cutoff order, if any, still fills the trigger with the chosen dish).
    const locked = daySelect.dataset.locked === 'true';
    const placeholder = !items.length ? 'No menu yet' : locked ? 'Ordering closed' : 'Not ordered yet';
    populateDaySelect(daySelect, items.map(i => i.item), placeholder);
    daySelect.dataset.hasMenu = items.length ? 'true' : 'false';
  }));
}

function updateDaySelectsAvailability() {
  const hasEmployee = !!state.employee;
  el.dayRows.querySelectorAll('.day-select').forEach(container => {
    const locked = container.dataset.locked === 'true';
    const hasMenu = container.dataset.hasMenu === 'true';
    setDaySelectDisabled(container, locked || !hasMenu || !hasEmployee);
  });
  updateSubmitState();
  updateProgress();
}

// "Submit weekly order" enables once a name is picked AND at least one
// still-open day with a menu has been resolved (a dish or an explicit
// "Skipping lunch" skip) — no need to fill in all 5 days before submitting.
function updateSubmitState() {
  if (!el.submitBtn) return;
  const openSelects = Array.from(el.dayRows.querySelectorAll('.day-select'))
    .filter(s => s.dataset.locked !== 'true' && s.dataset.hasMenu === 'true');
  const anyResolved = openSelects.some(s => s.dataset.value || s.dataset.skip === 'true');
  el.submitBtn.disabled = !state.employee || !anyResolved;
}

function setupDaySelects() {
  el.dayRows.addEventListener('click', (e) => {
    const trigger = e.target.closest('.day-select-trigger');
    if (trigger) {
      if (trigger.disabled) return;
      const container = trigger.closest('.day-select');
      const list = container.querySelector('.combobox-list');
      const isOpen = !list.classList.contains('hidden');
      closeAllDaySelects();
      if (!isOpen) {
        // Open upward when the trigger sits low in the viewport, so the menu
        // never spills past the bottom and forces the page to scroll.
        const rect = trigger.getBoundingClientRect();
        container.classList.toggle('drop-up', window.innerHeight - rect.bottom < 300);
        list.classList.remove('hidden');
      }
      return;
    }
    const option = e.target.closest('.day-select .combobox-option');
    if (option) {
      const container = option.closest('.day-select');
      const skipped = option.classList.contains('combobox-option-clear');
      setDaySelectValue(container, option.dataset.value, skipped);
      container.querySelector('.combobox-list').classList.add('hidden');
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.day-select')) closeAllDaySelects();
  });
}

function closeAllDaySelects() {
  el.dayRows.querySelectorAll('.day-select .combobox-list').forEach(list => list.classList.add('hidden'));
}

function populateDaySelect(container, values, placeholder) {
  container.dataset.placeholder = placeholder;
  const optionsHtml = values.length
    ? [`<div class="combobox-option combobox-option-clear" data-value="">Skipping lunch</div>`]
      .concat(values.map(v => `<div class="combobox-option" data-value="${escapeHtml(v)}">${escapeHtml(v)}</div>`))
      .join('')
    : '';
  container.querySelector('.combobox-list').innerHTML = optionsHtml;
  setDaySelectValue(container, '');
}

function setDaySelectDisabled(container, disabled) {
  container.classList.toggle('disabled', disabled);
  container.querySelector('.day-select-trigger').disabled = disabled;
}

function getDaySelectValue(container) {
  return container.dataset.value || '';
}

// `skipped` = the user explicitly chose "Skipping lunch" for this day (a
// deliberate skip), which is distinct from an untouched empty day: a skip
// counts as a resolved choice for the lock-in gate + progress meter, an
// untouched day does not. Only set true from the "Skipping lunch" option click.
function setDaySelectValue(container, value, skipped = false) {
  container.dataset.value = value || '';
  container.dataset.skip = !value && skipped ? 'true' : '';
  const trigger = container.querySelector('.day-select-trigger');
  const text = value || (skipped ? 'Skipping lunch' : (container.dataset.placeholder || 'Not ordered yet'));
  trigger.innerHTML = `<span class="day-select-trigger-text">${escapeHtml(text)}</span>`;
  // .placeholder = empty (untouched or skipped); .is-skipped distinguishes the
  // deliberate skip so CSS can swap the "+" cue for the "Skipping lunch" look.
  trigger.classList.toggle('placeholder', !value);
  trigger.classList.toggle('is-skipped', !value && skipped);
  updateSubmitState();
  updateProgress();
}

// Drives the mascot: a progress meter + a reactive one-liner based on how
// many of the week's days have a dish picked. Purely presentational.
function updateProgress() {
  if (!el.meterFill) return;
  const rows = Array.from(el.dayRows.querySelectorAll('.order-row'));
  const total = rows.length || WEEKDAY_COUNT;
  // A deliberate "Skipping lunch" skip counts as resolved, same as the lock-in gate.
  const picked = rows.filter(r => {
    const s = r.querySelector('.day-select');
    return s && (s.dataset.value || s.dataset.skip === 'true');
  }).length;
  el.meterFill.style.width = `${total ? (picked / total) * 100 : 0}%`;
  if (el.meterNum) el.meterNum.textContent = `${picked}/${total}`;
  if (el.buddySay) {
    setBuddySay(!state.employee ? 'Select <span class="accent">your name</span> to begin.'
      : picked === 0 ? 'Complete your <span class="accent">weekly order</span> below.'
      : picked < total ? `<span class="accent">${picked} selected</span>, ${total - picked} remaining.`
      : '<span class="accent">All orders selected</span>.');
  }
}

// `html` is code-authored (static strings + numbers), so innerHTML is safe and
// lets the accent keyword render as the colorful word, like the other pages' titles.
function setBuddySay(html) {
  const b = el.buddySay;
  if (!b || b.dataset.say === html) return;
  b.dataset.say = html;
  b.innerHTML = html;
}

// Which option is keyboard-highlighted; -1 = none. Reset whenever the list
// re-renders (typing/focus) so the highlight never points at a stale row.
let activeOptionIdx = -1;

function optionEls() {
  return [...el.employeeOptions.querySelectorAll('.combobox-option')];
}

// Move the highlight and mirror it to aria-activedescendant so a screen reader
// announces the focused option while real focus stays in the input.
function setActiveOption(idx) {
  const opts = optionEls();
  if (!opts.length) { activeOptionIdx = -1; el.employeeSearch.removeAttribute('aria-activedescendant'); return; }
  activeOptionIdx = (idx + opts.length) % opts.length;
  opts.forEach((o, i) => o.classList.toggle('combobox-option-active', i === activeOptionIdx));
  const active = opts[activeOptionIdx];
  active.scrollIntoView({ block: 'nearest' });
  el.employeeSearch.setAttribute('aria-activedescendant', active.id);
}

function setupCombobox() {
  // ARIA combobox wiring so the picker is operable by keyboard + screen reader.
  el.employeeSearch.setAttribute('role', 'combobox');
  el.employeeSearch.setAttribute('aria-autocomplete', 'list');
  el.employeeSearch.setAttribute('aria-expanded', 'false');
  el.employeeSearch.setAttribute('aria-controls', el.employeeOptions.id);
  el.employeeOptions.setAttribute('role', 'listbox');

  renderOptions(state.employees);

  el.employeeSearch.addEventListener('focus', () => {
    renderOptions(state.employees);
    showOptions();
    el.employeeSearch.select();
  });
  el.employeeSearch.addEventListener('input', () => {
    renderOptions(filterEmployees(el.employeeSearch.value));
    showOptions();
    if (!el.employeeSearch.value.trim()) selectEmployee('');
  });
  // Full keyboard operability: ↓/↑ move the highlight, Enter picks it (or the
  // top match), Escape closes. Prevents the arrow keys from moving the caret.
  el.employeeSearch.addEventListener('keydown', (e) => {
    const open = !el.employeeOptions.classList.contains('hidden');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { renderOptions(filterEmployees(el.employeeSearch.value)); showOptions(); }
      setActiveOption(activeOptionIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { renderOptions(filterEmployees(el.employeeSearch.value)); showOptions(); }
      setActiveOption(activeOptionIdx - 1);
    } else if (e.key === 'Enter') {
      const opts = optionEls();
      if (open && opts.length) {
        e.preventDefault();
        const pick = activeOptionIdx >= 0 ? opts[activeOptionIdx] : opts[0];
        if (pick && pick.dataset.name) selectEmployee(pick.dataset.name);
      }
    } else if (e.key === 'Escape') {
      hideOptions();
    }
  });
  el.employeeSearch.addEventListener('blur', () => {
    // Delay so a click on an option registers before the list disappears.
    setTimeout(() => {
      hideOptions();
      if (el.employeeSearch.value !== state.employee) {
        el.employeeSearch.value = state.employee;
      }
    }, 150);
  });
  el.employeeOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.combobox-option');
    if (option) selectEmployee(option.dataset.name);
  });
  // mousedown (not click) only to stop the input's blur handler from firing
  // first on a mouse click — the actual clear runs on 'click' so it also
  // fires for keyboard activation (Enter/Space), which never dispatches
  // mousedown.
  el.employeeClearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  el.employeeClearBtn.addEventListener('click', () => {
    selectEmployee('');
    el.employeeSearch.focus();
  });
}

function filterEmployees(query) {
  const q = query.trim().toLowerCase();
  if (!q) return state.employees;
  return state.employees.filter(name => name.toLowerCase().includes(q));
}

function renderOptions(names) {
  el.employeeOptions.innerHTML = names.length
    ? names.map((name, i) => `<div class="combobox-option" role="option" id="emp-opt-${i}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>`).join('')
    : '<div class="combobox-empty">No matching names</div>';
  // the option set changed — drop any stale keyboard highlight
  activeOptionIdx = -1;
  el.employeeSearch.removeAttribute('aria-activedescendant');
}

function showOptions() {
  // Open upward when the input sits low in the viewport, so the list never
  // spills past the bottom and forces the page to scroll (same rule as the
  // per-day dish pickers below it).
  const rect = el.employeeSearch.getBoundingClientRect();
  el.employeeSearch.closest('.combobox').classList.toggle('dropup', window.innerHeight - rect.bottom < 300);
  el.employeeOptions.classList.remove('hidden');
  el.employeeSearch.setAttribute('aria-expanded', 'true');
}

function hideOptions() {
  el.employeeOptions.classList.add('hidden');
  el.employeeSearch.setAttribute('aria-expanded', 'false');
  el.employeeSearch.removeAttribute('aria-activedescendant');
}

async function selectEmployee(name) {
  state.employee = name;
  el.employeeSearch.value = name;
  hideOptions();
  el.employeeClearBtn.classList.toggle('hidden', !name);
  updateDaySelectsAvailability();
  if (!name) {
    resetDaySelections();
    return;
  }
  try {
    for (const date of state.dates) {
      const row = el.dayRows.querySelector(`[data-date="${date}"]`);
      const daySelect = row.querySelector('.day-select');
      const existing = await Api.getOrderForEmployee(date, name);
      const isSkip = !!existing && existing.skipped === true;
      setDaySelectValue(daySelect, existing && !isSkip ? existing.item : '', isSkip);
    }
  } catch (err) {
    // Pre-fill is best-effort; ignore failures silently.
  }
}

function resetDaySelections() {
  el.dayRows.querySelectorAll('.day-select').forEach(container => setDaySelectValue(container, ''));
}

async function onSubmit(e) {
  e.preventDefault();
  if (!state.employee) return showSnackbar('Please select your name.', true);

  el.submitBtn.disabled = true;
  try {
    const rows = Array.from(el.dayRows.querySelectorAll('.order-row:not(.locked)'));
    for (const row of rows) {
      const daySelect = row.querySelector('.day-select');
      const value = getDaySelectValue(daySelect);
      const skipped = daySelect.dataset.skip === 'true';
      if (value) {
        await Api.submitOrder(row.dataset.date, state.employee, value);
      } else if (skipped) {
        await Api.skipOrder(row.dataset.date, state.employee);
      } else {
        await Api.removeOrder(row.dataset.date, state.employee);
      }
    }
    showSnackbar(SUCCESS_MESSAGE, false);
  } catch (err) {
    // Surface the real cause so update failures can be diagnosed, not guessed.
    console.error('[m_lunch] order submit failed:', err);
    showSnackbar('Could not submit order. Please try again.', true);
  } finally {
    updateSubmitState();
  }
}

init();
