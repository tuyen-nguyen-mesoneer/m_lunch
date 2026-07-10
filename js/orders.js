import { Api } from './api.js';
import { weekDates, weekdayLabel, formatDate, toDateStr, addDays, mondayOf } from './dateUtils.js';
import { escapeHtml, teamIconHtml, dayIconHtml, trapOverlayFocus } from './domUtils.js';
import { getKnownTeams, groupByTeam, teamOf } from './teamGroup.js';
import { isAdminAuthenticated } from './adminSession.js';
import { showSnackbar } from './snackbar.js';
import { confirmDialog } from './confirmDialog.js';
import { enhanceDatePickers } from './datePicker.js';

// Logged-in admins get inline controls to add/delete orders for members,
// bypassing the member-facing cutoff lock. Non-admins see a read-only report.
const IS_ADMIN = isAdminAuthenticated();

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatSubmittedTime(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== 'function') return '—';
  const d = timestamp.toDate();
  const pad = n => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${WEEKDAY_SHORT[d.getDay()]} ${time} ${date}`;
}

const state = { weekStart: '', dates: [], teams: new Set(), teamsList: [], items: new Set(), itemsList: [], days: new Set(), names: new Set(), employees: [], ordersByDate: {}, expanded: {}, filterActive: false, sectionExpanded: { past: false, upcoming: true } };

const el = {
  weekLabel: document.getElementById('weekLabel'),
  changeWeekBtn: document.getElementById('changeWeekBtn'),
  changeWeekOverlay: document.getElementById('changeWeekOverlay'),
  changeWeekInput: document.getElementById('changeWeekInput'),
  changeWeekCancel: document.getElementById('changeWeekCancel'),
  changeWeekSubmit: document.getElementById('changeWeekSubmit'),
  searchInput: document.getElementById('searchInput'),
  searchClearBtn: document.getElementById('searchClearBtn'),
  searchOptions: document.getElementById('searchOptions'),
  dayFilterSelect: document.getElementById('dayFilterSelect'),
  dayFilterTrigger: document.getElementById('dayFilterTrigger'),
  dayFilterOptions: document.getElementById('dayFilterOptions'),
  teamFilterSelect: document.getElementById('teamFilterSelect'),
  teamFilterTrigger: document.getElementById('teamFilterTrigger'),
  teamFilterOptions: document.getElementById('teamFilterOptions'),
  itemFilterSelect: document.getElementById('itemFilterSelect'),
  itemFilterTrigger: document.getElementById('itemFilterTrigger'),
  itemFilterOptions: document.getElementById('itemFilterOptions'),
  summaryDays: document.getElementById('summaryDays'),
  weekSummary: document.getElementById('weekSummary'),
  noResultsAll: document.getElementById('noResultsAll'),
  clearFiltersBtn: document.getElementById('clearFiltersBtn'),
  adminAddOrderBtn: document.getElementById('adminAddOrderBtn'),
  addOrderOverlay: document.getElementById('addOrderOverlay'),
  addOrderDaySelect: document.getElementById('addOrderDaySelect'),
  addOrderDayTrigger: document.getElementById('addOrderDayTrigger'),
  addOrderDayOptions: document.getElementById('addOrderDayOptions'),
  addOrderMemberSearch: document.getElementById('addOrderMemberSearch'),
  addOrderMemberClearBtn: document.getElementById('addOrderMemberClearBtn'),
  addOrderMemberOptions: document.getElementById('addOrderMemberOptions'),
  addOrderDishSelect: document.getElementById('addOrderDishSelect'),
  addOrderDishTrigger: document.getElementById('addOrderDishTrigger'),
  addOrderDishOptions: document.getElementById('addOrderDishOptions'),
  addOrderCancel: document.getElementById('addOrderCancel'),
  addOrderSubmit: document.getElementById('addOrderSubmit'),
};

// Deterministic food emoji for a dish name (same dish → same emoji every time),
// so the report rows carry the same playful cue as the order-page dish picker.
const DISH_EMOJI = [
  // rice / noodles / mains
  '🍜', '🍚', '🍙', '🍲', '🥗', '🍱', '🍛', '🍝', '🥘', '🍢',
  '🍣', '🍤', '🍥', '🥟', '🥮', '🌮', '🌯', '🫔', '🥙', '🧆',
  '🍕', '🍔', '🌭', '🥪', '🫕', '🥣', '🍿', '🧈', '🧂',
  // proteins
  '🥩', '🍗', '🍖', '🥓', '🍳', '🥚', '🦀', '🦞', '🦐', '🦑',
  '🦪', '🐟', '🐠',
  // breads / baked
  '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🧇', '🥞', '🧀', '🥧',
  // desserts / sweets
  '🍰', '🧁', '🍮', '🍧', '🍨', '🍦', '🍩', '🍪', '🎂', '🍫',
  '🍬', '🍭', '🍯', '🍡', '🍘', '🥠',
  // fruit
  '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏',
  '🍐', '🍑', '🍒', '🍓', '🫐', '🥝', '🥥', '🥑',
  // veg
  '🥜', '🌰', '🥦', '🥬', '🥒', '🍆', '🍠', '🥔', '🧅', '🧄',
  '🌽', '🥕', '🍄', '🍅', '🫑', '🌶️', '🫒',
  // drinks
  '☕', '🍵', '🧋', '🥤', '🧃', '🧉', '🍶', '🍷', '🍺', '🥛',
];
function dishEmoji(name) {
  let sum = 0;
  for (const ch of String(name)) sum += ch.codePointAt(0);
  return DISH_EMOJI[sum % DISH_EMOJI.length];
}
function dishEmojiHtml(name) {
  return `<span class="dish-emoji" aria-hidden="true">${dishEmoji(name)}</span>`;
}

const WEEKDAY_COUNT = 5;

function renderSummarySkeleton() {
  el.summaryDays.innerHTML = Array.from({ length: WEEKDAY_COUNT }).map(() => `
    <div class="day-block">
      <div class="panel day-card">
        <div class="totals-header">
          <span class="skeleton skeleton-heading"></span>
          <span class="skeleton skeleton-total-chip"></span>
        </div>
        <div class="totals-panel">
          <div class="totals">
            <span class="skeleton skeleton-totals-chip"></span>
            <span class="skeleton skeleton-totals-chip"></span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// Filters are mirrored into the URL query string (see syncFiltersToUrl,
// called at the end of every applyFilters) so refreshing (or sharing the
// link) restores the same filtered view instead of resetting to "All". Days
// are stored as weekday abbreviations ("mon", "tue") rather than the actual
// date, since that's what the current week's dates map to and it reads much
// cleaner in a URL.
function dayAbbrev(date) { return weekdayLabel(date).slice(0, 3).toLowerCase(); }

function readFiltersFromUrl() {
  const params = new URLSearchParams(location.search);
  const days = (params.get('days') || '').split('|').filter(Boolean);
  state.dates.filter(d => days.includes(dayAbbrev(d))).forEach(d => state.days.add(d));
  (params.get('teams') || '').split('|').filter(t => state.teamsList.includes(t)).forEach(t => state.teams.add(t));
  (params.get('names') || '').split('|').filter(Boolean).forEach(n => state.names.add(n));
  (params.get('items') || '').split('|').filter(Boolean).forEach(i => state.items.add(i));
}

function syncFiltersToUrl() {
  const params = new URLSearchParams();
  if (state.days.size) params.set('days', [...state.days].map(dayAbbrev).join('|'));
  if (state.teams.size) params.set('teams', [...state.teams].join('|'));
  if (state.names.size) params.set('names', [...state.names].join('|'));
  if (state.items.size) params.set('items', [...state.items].join('|'));
  const qs = params.toString();
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

async function init() {
  renderSummarySkeleton();
  state.weekStart = await Api.ensureCurrentWeek();
  state.dates = weekDates(state.weekStart);
  el.weekLabel.textContent = `${formatDate(state.dates[0])} – ${formatDate(state.dates[4])}`;

  // Fetched before the filter dropdowns are built (not after, as before) —
  // the team filter list is now derived from real employee data rather than
  // a fixed list, so it needs employees loaded first.
  const employees = await Api.getEmployees();
  state.employeesRaw = employees;
  state.employees = employees.map(e => e.name).sort((a, b) => a.localeCompare(b));
  state.teamsList = getKnownTeams(employees);

  readFiltersFromUrl();

  setupDayFilter();
  setupTeamFilter();

  // Drop any restored name that no longer matches a real employee.
  for (const name of [...state.names]) {
    if (!state.employees.includes(name)) state.names.delete(name);
  }
  await renderSummary(employees);

  // Drop any restored item that no longer matches this week's menu.
  state.itemsList = await computeItemsList();
  for (const item of [...state.items]) {
    if (!state.itemsList.includes(item)) state.items.delete(item);
  }
  setupItemFilter();

  setupSearchCombobox();
  setupDayToggles();
  el.clearFiltersBtn.addEventListener('click', clearAllFilters);
  enhanceFilterA11y(el.dayFilterTrigger, el.dayFilterOptions);
  enhanceFilterA11y(el.teamFilterTrigger, el.teamFilterOptions);
  enhanceFilterA11y(el.itemFilterTrigger, el.itemFilterOptions);
  enhanceSearchA11y();
  if (IS_ADMIN) { setupAdminOrderControls(); setupChangeWeek(); }
  applyFilters();
}

// Lets an admin manually point the report at a different Monday-starting
// week — same shared config/currentWeek doc as the admin panel's override.
function setupChangeWeek() {
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
    state.days.clear();
    renderDayFilterOptions();
    updateDayFilterTrigger();
    await refreshReport();
    closeChangeWeek();
    showSnackbar(`Now showing the week of <strong>${escapeHtml(formatDate(state.dates[0]))}</strong>.`);
  } catch (err) {
    showSnackbar('Could not change the week. Please try again.', true);
  } finally {
    el.changeWeekSubmit.disabled = false;
  }
}

// Keyboard operability for the button-triggered multi-select filters (day /
// team / dish): ↓/↑ move a highlight, Enter/Space toggles the highlighted
// option (reusing its click handler), Escape closes and returns focus. Options
// are tagged with roles/ids lazily so the render functions stay untouched.
function enhanceFilterA11y(trigger, list) {
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  list.setAttribute('role', 'listbox');
  let active = -1;
  const opts = () => [...list.querySelectorAll('.combobox-option')];
  const isOpen = () => !list.classList.contains('hidden');
  const tag = () => opts().forEach((o, i) => { o.setAttribute('role', 'option'); if (!o.id) o.id = `${list.id}-opt-${i}`; });
  const syncExpanded = () => trigger.setAttribute('aria-expanded', String(isOpen()));
  const setActive = (i) => {
    const o = opts();
    if (!o.length) { active = -1; trigger.removeAttribute('aria-activedescendant'); return; }
    active = (i + o.length) % o.length;
    o.forEach((el, idx) => el.classList.toggle('combobox-option-active', idx === active));
    o[active].scrollIntoView({ block: 'nearest' });
    trigger.setAttribute('aria-activedescendant', o[active].id);
  };
  trigger.addEventListener('click', () => setTimeout(() => { syncExpanded(); if (isOpen()) { tag(); active = -1; } }, 0));
  // Typeahead: typing a letter jumps to the next option starting with it —
  // same as a native <select>, useful once the list (e.g. "All dishes") has
  // more entries than fit on screen. Repeated presses of the same letter
  // cycle through every match; the buffer resets after a short pause so a
  // fresh word starts a new search instead of appending to the old one.
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
      setTimeout(() => { if (isOpen()) { tag(); setActive(Math.min(active, opts().length - 1)); } else syncExpanded(); }, 0);
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      list.classList.add('hidden');
      syncExpanded();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!isOpen()) { trigger.click(); setTimeout(() => tag(), 0); }
      else tag();
      clearTimeout(typeaheadTimer);
      typeaheadBuffer += e.key.toLowerCase();
      typeaheadTimer = setTimeout(() => { typeaheadBuffer = ''; }, 700);
      const o = opts();
      if (!o.length) return;
      // Match against the visible text, not data-value (which for the day
      // picker holds a raw ISO date, not the "Mon, 20/7" label people read) —
      // strip any leading hidden icon glyph (team/dish options prefix one).
      const label = (el) => (el.textContent || '').trim().replace(/^[^a-z0-9]+/i, '').toLowerCase();
      // Same letter repeated with nothing else typed (e.g. "c", "c", "c") —
      // cycle to the next match after the current one instead of re-picking
      // the first, like a native select does.
      const repeatingSingleLetter = typeaheadBuffer.length > 1 && [...typeaheadBuffer].every(c => c === typeaheadBuffer[0]);
      const query = repeatingSingleLetter ? typeaheadBuffer[0] : typeaheadBuffer;
      const startIdx = repeatingSingleLetter ? (active + 1) % o.length : 0;
      const order = [...Array(o.length).keys()].map(i => (startIdx + i) % o.length);
      const match = order.find(i => label(o[i]).startsWith(query));
      if (match != null) setActive(match);
    }
  });
}

// Same idea for the name search combobox (input-based, multi-select): typing
// filters, ↓/↑ highlight, Enter toggles the highlighted name, Escape closes.
function enhanceSearchA11y() {
  el.searchInput.setAttribute('role', 'combobox');
  el.searchInput.setAttribute('aria-autocomplete', 'list');
  el.searchInput.setAttribute('aria-expanded', 'false');
  el.searchInput.setAttribute('aria-controls', el.searchOptions.id);
  el.searchOptions.setAttribute('role', 'listbox');
  let active = -1;
  const opts = () => [...el.searchOptions.querySelectorAll('.combobox-option')];
  const isOpen = () => !el.searchOptions.classList.contains('hidden');
  const tag = () => opts().forEach((o, i) => { o.setAttribute('role', 'option'); if (!o.id) o.id = `search-opt-${i}`; });
  const setActive = (i) => {
    const o = opts();
    if (!o.length) { active = -1; el.searchInput.removeAttribute('aria-activedescendant'); return; }
    active = (i + o.length) % o.length;
    o.forEach((el2, idx) => el2.classList.toggle('combobox-option-active', idx === active));
    o[active].scrollIntoView({ block: 'nearest' });
    el.searchInput.setAttribute('aria-activedescendant', o[active].id);
  };
  el.searchInput.addEventListener('input', () => { active = -1; el.searchInput.setAttribute('aria-expanded', 'true'); });
  el.searchInput.addEventListener('focus', () => el.searchInput.setAttribute('aria-expanded', 'true'));
  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); tag(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); tag(); setActive(active - 1); }
    else if (e.key === 'Enter' && isOpen() && active >= 0) {
      e.preventDefault();
      opts()[active]?.click();
      setTimeout(() => { tag(); if (isOpen()) setActive(Math.min(active, opts().length - 1)); }, 0);
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      el.searchOptions.classList.add('hidden');
      el.searchInput.setAttribute('aria-expanded', 'false');
    }
  });
}

// The dish filter list — this week's menu, not just dishes someone actually
// ordered, so it still lists a dish nobody's picked yet.
async function computeItemsList() {
  const columns = await Promise.all(state.dates.map(date => Api.getMenu(date)));
  return [...new Set(columns.flat().map(m => m.item).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// Rebuild the report after an admin add/delete, keeping filters applied.
async function refreshReport() {
  await renderSummary(state.employeesRaw);
  state.itemsList = await computeItemsList();
  for (const item of [...state.items]) if (!state.itemsList.includes(item)) state.items.delete(item);
  renderItemFilterOptions();
  updateItemFilterTrigger();
  applyFilters();
}

// Inline admin editing on the report: delete any order from its row, or add one
// via the "Add order" dialog. Delete is delegated off the summary container
// since day cards are re-rendered on every refresh.
function setupAdminOrderControls() {
  el.adminAddOrderBtn.classList.remove('hidden');
  el.adminAddOrderBtn.addEventListener('click', openAddOrderDialog);
  setupAddOrderDaySelect();
  setupAddOrderDishSelect();
  setupAddOrderMemberCombobox();
  enhanceFilterA11y(el.addOrderDayTrigger, el.addOrderDayOptions);
  enhanceFilterA11y(el.addOrderDishTrigger, el.addOrderDishOptions);
  el.addOrderCancel.addEventListener('click', closeAddOrderDialog);
  el.addOrderSubmit.addEventListener('click', submitAddOrder);
  el.addOrderOverlay.addEventListener('click', (e) => { if (e.target === el.addOrderOverlay) closeAddOrderDialog(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.addOrderOverlay.classList.contains('hidden')) closeAddOrderDialog();
  });

  el.summaryDays.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.order-entry-del');
    if (!delBtn) return;
    const { date, employee } = delBtn.dataset;
    const ok = await confirmDialog(`Delete ${employee}'s order for ${formatDate(date)}?`, {
      danger: true,
      messageHtml: `Delete <strong>${escapeHtml(employee)}</strong>'s order for <strong>${escapeHtml(formatDate(date))}</strong>?`,
    });
    if (!ok) return;
    try {
      await Api.removeOrder(date, employee);
      showSnackbar(`Deleted <strong>${escapeHtml(employee)}</strong>'s order.`);
      await refreshReport();
    } catch (err) {
      showSnackbar('Could not delete the order. Please try again.', true);
    }
  });
}

// The chosen member's name — kept separately from the search input's text so
// a half-typed query never gets mistaken for a real selection.
let addOrderMember = '';
let addOrderMemberActiveIdx = -1;
let addOrderDay = '';
let addOrderDish = '';

function openAddOrderDialog() {
  renderAddOrderDayOptions();
  const today = toDateStr(new Date());
  selectAddOrderDay(state.dates.includes(today) ? today : (state.dates[0] || ''));
  selectAddOrderMember('');
  renderAddOrderMemberOptions(addOrderMemberNames());
  el.addOrderOverlay.classList.remove('hidden');
  releaseAddOrderFocusTrap = trapOverlayFocus(el.addOrderOverlay);
}

let releaseAddOrderFocusTrap = null;

function closeAddOrderDialog() {
  el.addOrderOverlay.classList.add('hidden');
  el.addOrderDayOptions.classList.add('hidden');
  el.addOrderDishOptions.classList.add('hidden');
  releaseAddOrderFocusTrap?.();
}

// ---- Day picker (single-select trigger, same look as the report's filters) ----
function renderAddOrderDayOptions() {
  el.addOrderDayOptions.innerHTML = state.dates
    .map(d => `<div class="combobox-option" data-value="${d}">${weekdayLabel(d).slice(0, 3)}, ${formatDate(d)}</div>`).join('');
}

function selectAddOrderDay(date) {
  addOrderDay = date;
  el.addOrderDayTrigger.classList.toggle('placeholder', !date);
  setTriggerText(el.addOrderDayTrigger, date ? `${weekdayLabel(date).slice(0, 3)}, ${formatDate(date)}` : 'Choose a day…');
  el.addOrderDayOptions.classList.add('hidden');
  populateAddOrderDishes();
}

function setupAddOrderDaySelect() {
  el.addOrderDayTrigger.addEventListener('click', () => {
    el.addOrderDishOptions.classList.add('hidden');
    el.addOrderDayOptions.classList.toggle('hidden');
  });
  el.addOrderDayOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.combobox-option');
    if (option) selectAddOrderDay(option.dataset.value);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#addOrderDaySelect')) el.addOrderDayOptions.classList.add('hidden');
  });
}

// ---- Dish picker — options track the chosen day's menu (fetched on demand) ----
function setupAddOrderDishSelect() {
  el.addOrderDishTrigger.addEventListener('click', () => {
    if (el.addOrderDishTrigger.disabled) return;
    el.addOrderDayOptions.classList.add('hidden');
    el.addOrderDishOptions.classList.toggle('hidden');
  });
  el.addOrderDishOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.combobox-option');
    if (option && option.dataset.value) selectAddOrderDish(option.dataset.value);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#addOrderDishSelect')) el.addOrderDishOptions.classList.add('hidden');
  });
}

function selectAddOrderDish(item) {
  addOrderDish = item;
  el.addOrderDishTrigger.classList.toggle('placeholder', !item);
  setTriggerText(el.addOrderDishTrigger, item ? item : 'Choose a dish…');
  el.addOrderDishOptions.classList.add('hidden');
}

function addOrderMemberNames() {
  return state.employeesRaw.map(e => e.name).sort((a, b) => a.localeCompare(b));
}

function filterAddOrderMembers(query) {
  const q = query.trim().toLowerCase();
  if (!q) return addOrderMemberNames();
  return addOrderMemberNames().filter(name => name.toLowerCase().includes(q));
}

function addOrderMemberOptionEls() {
  return [...el.addOrderMemberOptions.querySelectorAll('.combobox-option')];
}

function setAddOrderMemberActiveOption(idx) {
  const opts = addOrderMemberOptionEls();
  if (!opts.length) { addOrderMemberActiveIdx = -1; el.addOrderMemberSearch.removeAttribute('aria-activedescendant'); return; }
  addOrderMemberActiveIdx = (idx + opts.length) % opts.length;
  opts.forEach((o, i) => o.classList.toggle('combobox-option-active', i === addOrderMemberActiveIdx));
  const active = opts[addOrderMemberActiveIdx];
  active.scrollIntoView({ block: 'nearest' });
  el.addOrderMemberSearch.setAttribute('aria-activedescendant', active.id);
}

function renderAddOrderMemberOptions(names) {
  el.addOrderMemberOptions.innerHTML = names.length
    ? names.map((name, i) => `<div class="combobox-option" role="option" id="add-order-member-opt-${i}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>`).join('')
    : '<div class="combobox-empty">No matching members</div>';
  addOrderMemberActiveIdx = -1;
  el.addOrderMemberSearch.removeAttribute('aria-activedescendant');
}

function showAddOrderMemberOptions() {
  el.addOrderMemberOptions.classList.remove('hidden');
  el.addOrderMemberSearch.setAttribute('aria-expanded', 'true');
}

function hideAddOrderMemberOptions() {
  el.addOrderMemberOptions.classList.add('hidden');
  el.addOrderMemberSearch.setAttribute('aria-expanded', 'false');
  el.addOrderMemberSearch.removeAttribute('aria-activedescendant');
}

function selectAddOrderMember(name) {
  addOrderMember = name;
  el.addOrderMemberSearch.value = name;
  el.addOrderMemberSearch.classList.toggle('has-selection', !!name);
  el.addOrderMemberClearBtn.classList.toggle('hidden', !name);
  hideAddOrderMemberOptions();
}

function setupAddOrderMemberCombobox() {
  el.addOrderMemberSearch.setAttribute('role', 'combobox');
  el.addOrderMemberSearch.setAttribute('aria-autocomplete', 'list');
  el.addOrderMemberSearch.setAttribute('aria-expanded', 'false');
  el.addOrderMemberSearch.setAttribute('aria-controls', el.addOrderMemberOptions.id);
  el.addOrderMemberOptions.setAttribute('role', 'listbox');

  el.addOrderMemberSearch.addEventListener('focus', () => {
    renderAddOrderMemberOptions(addOrderMemberNames());
    showAddOrderMemberOptions();
    el.addOrderMemberSearch.select();
  });
  el.addOrderMemberSearch.addEventListener('input', () => {
    renderAddOrderMemberOptions(filterAddOrderMembers(el.addOrderMemberSearch.value));
    showAddOrderMemberOptions();
    if (!el.addOrderMemberSearch.value.trim()) selectAddOrderMember('');
  });
  el.addOrderMemberSearch.addEventListener('keydown', (e) => {
    const open = !el.addOrderMemberOptions.classList.contains('hidden');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { renderAddOrderMemberOptions(filterAddOrderMembers(el.addOrderMemberSearch.value)); showAddOrderMemberOptions(); }
      setAddOrderMemberActiveOption(addOrderMemberActiveIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { renderAddOrderMemberOptions(filterAddOrderMembers(el.addOrderMemberSearch.value)); showAddOrderMemberOptions(); }
      setAddOrderMemberActiveOption(addOrderMemberActiveIdx - 1);
    } else if (e.key === 'Enter') {
      const opts = addOrderMemberOptionEls();
      if (open && opts.length) {
        e.preventDefault();
        const pick = addOrderMemberActiveIdx >= 0 ? opts[addOrderMemberActiveIdx] : opts[0];
        if (pick && pick.dataset.name) selectAddOrderMember(pick.dataset.name);
      }
    } else if (e.key === 'Escape') {
      hideAddOrderMemberOptions();
    }
  });
  el.addOrderMemberSearch.addEventListener('blur', () => {
    setTimeout(() => {
      hideAddOrderMemberOptions();
      if (el.addOrderMemberSearch.value !== addOrderMember) el.addOrderMemberSearch.value = addOrderMember;
    }, 150);
  });
  el.addOrderMemberOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.combobox-option');
    if (option && option.dataset.name) selectAddOrderMember(option.dataset.name);
  });
  // mousedown only stops the input's blur handler firing first on a mouse
  // click; the clear itself runs on 'click' so Enter/Space (keyboard
  // activation) — which never dispatches mousedown — also triggers it.
  el.addOrderMemberClearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  el.addOrderMemberClearBtn.addEventListener('click', () => {
    selectAddOrderMember('');
    el.addOrderMemberSearch.focus();
  });
}

// Dish options track the chosen day's menu (fetched on demand).
async function populateAddOrderDishes() {
  const date = addOrderDay;
  selectAddOrderDish('');
  el.addOrderDishTrigger.disabled = true;
  setTriggerText(el.addOrderDishTrigger, 'Loading…');
  const menu = await Api.getMenu(date);
  const dishes = menu.map(m => m.item).filter(Boolean);
  el.addOrderDishOptions.innerHTML = dishes.length
    ? dishes.map(d => `<div class="combobox-option" data-value="${escapeHtml(d)}">${escapeHtml(d)}</div>`).join('')
    : '<div class="combobox-empty">No menu set for this day</div>';
  el.addOrderDishTrigger.disabled = false;
  setTriggerText(el.addOrderDishTrigger, 'Choose a dish…');
}

async function submitAddOrder() {
  const date = addOrderDay;
  const employee = addOrderMember;
  const item = addOrderDish;
  if (!date || !employee || !item) {
    showSnackbar('Please select a day, a member, and a dish.', true);
    return;
  }
  el.addOrderSubmit.disabled = true;
  try {
    await Api.submitOrder(date, employee, item);
    showSnackbar(`Added <strong>${escapeHtml(employee)}</strong>'s order.`);
    closeAddOrderDialog();
    await refreshReport();
  } catch (err) {
    showSnackbar('Could not add the order. Please try again.', true);
  } finally {
    el.addOrderSubmit.disabled = false;
  }
}

// Reset every filter at once (search, days, teams, dishes) and refresh the UI.
function clearAllFilters() {
  state.names.clear();
  state.days.clear();
  state.teams.clear();
  state.items.clear();
  el.searchInput.value = '';
  renderSearchOptions(filterEmployees(''));
  updateSearchClearBtn();
  updateSearchPlaceholder();
  renderDayFilterOptions();
  updateDayFilterTrigger();
  renderTeamFilterOptions();
  updateTeamFilterTrigger();
  renderItemFilterOptions();
  updateItemFilterTrigger();
  applyFilters();
}

// Multi-select: clicking a day toggles it on/off and keeps the dropdown
// open so more days can be picked; "All days" clears the selection and closes it.
function setupDayFilter() {
  renderDayFilterOptions();
  updateDayFilterTrigger();

  el.dayFilterTrigger.addEventListener('click', () => {
    el.dayFilterOptions.classList.toggle('hidden');
  });
  el.dayFilterOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.combobox-option');
    if (!option) return;
    const date = option.dataset.value;
    if (!date) {
      state.days.clear();
      renderDayFilterOptions();
      el.dayFilterOptions.classList.add('hidden');
    } else {
      // Toggle the clicked option in place rather than re-rendering the
      // whole list — replacing the option's own DOM node here would detach
      // it before the click finishes bubbling to the document listener
      // below, which checks e.target.closest() to decide whether to close.
      if (state.days.has(date)) state.days.delete(date);
      else state.days.add(date);
      option.classList.toggle('combobox-option-checked', state.days.has(date));
    }
    updateDayFilterTrigger();
    applyFilters();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#dayFilterSelect')) el.dayFilterOptions.classList.add('hidden');
  });
}

function renderDayFilterOptions() {
  el.dayFilterOptions.innerHTML = [`<div class="combobox-option combobox-option-clear" data-value="">All days</div>`]
    .concat(state.dates.map(date => `
      <div class="combobox-option${state.days.has(date) ? ' combobox-option-checked' : ''}" data-value="${date}">
        <span class="combobox-checkbox"></span>${dayIconHtml()}${weekdayLabel(date).slice(0, 3)}, ${date.slice(8, 10)}/${date.slice(5, 7)}
      </div>
    `))
    .join('');
}

// A selected filter label (a team name, a full dish name) can be arbitrarily
// long — this wraps it in the same truncating span the day-select-trigger
// buttons on the employee page use, so a long selection ellipsizes instead
// of forcing the trigger (and the whole filter row) wider than the viewport.
function setTriggerText(trigger, text) {
  trigger.innerHTML = `<span class="day-select-trigger-text">${escapeHtml(text)}</span>`;
}

function updateDayFilterTrigger() {
  const selected = state.dates.filter(d => state.days.has(d));
  el.dayFilterTrigger.classList.toggle('placeholder', selected.length === 0);
  if (selected.length === 0) {
    setTriggerText(el.dayFilterTrigger, 'All days');
  } else if (selected.length === 1) {
    const [date] = selected;
    setTriggerText(el.dayFilterTrigger, `${weekdayLabel(date).slice(0, 3)}, ${date.slice(8, 10)}/${date.slice(5, 7)}`);
  } else {
    setTriggerText(el.dayFilterTrigger, `${selected.length} days selected`);
  }
}

// Typing narrows the option list and (when nothing is checked yet) still
// does a quick free-text substring search directly, same as before. Once
// at least one name is checked, checked names become the real filter and
// the typed text goes back to just narrowing which names show in the list.
function setupSearchCombobox() {
  updateSearchClearBtn();
  updateSearchPlaceholder();

  el.searchInput.addEventListener('focus', () => {
    renderSearchOptions(filterEmployees(el.searchInput.value));
    el.searchOptions.classList.remove('hidden');
  });
  el.searchInput.addEventListener('input', () => {
    updateSearchClearBtn();
    renderSearchOptions(filterEmployees(el.searchInput.value));
    el.searchOptions.classList.remove('hidden');
    applyFilters();
  });
  el.searchOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.combobox-option');
    if (!option) return;
    const name = option.dataset.name;
    // Toggle the clicked option in place — replacing the option's own DOM
    // node here would detach it before the click finishes bubbling to the
    // document listener below, which checks e.target.closest() to decide
    // whether to close (same bug as the day/team filters had).
    if (state.names.has(name)) state.names.delete(name);
    else state.names.add(name);
    option.classList.toggle('combobox-option-checked', state.names.has(name));
    updateSearchClearBtn();
    updateSearchPlaceholder();
    applyFilters();
  });
  // mousedown only stops the input's blur handler firing first on a mouse
  // click; the clear itself runs on 'click' so Enter/Space (keyboard
  // activation) — which never dispatches mousedown — also triggers it.
  el.searchClearBtn.addEventListener('mousedown', (e) => e.preventDefault());
  el.searchClearBtn.addEventListener('click', () => {
    el.searchInput.value = '';
    state.names.clear();
    renderSearchOptions(filterEmployees(''));
    updateSearchClearBtn();
    updateSearchPlaceholder();
    el.searchInput.focus();
    applyFilters();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#searchCombobox')) return;
    el.searchOptions.classList.add('hidden');
    // Once closed, drop back to showing the selection summary (via
    // placeholder) instead of leaving whatever was typed to narrow the list.
    el.searchInput.value = '';
    updateSearchClearBtn();
  });
}

function updateSearchClearBtn() {
  el.searchClearBtn.classList.toggle('hidden', !el.searchInput.value && state.names.size === 0);
}

function updateSearchPlaceholder() {
  const selected = [...state.names];
  el.searchInput.placeholder = selected.length === 0
    ? 'Search by name…'
    : selected.length === 1
      ? selected[0]
      : `${selected.length} names selected`;
  // Matches the day/team triggers' white, bold "N selected" text instead of
  // the default muted placeholder color.
  el.searchInput.classList.toggle('has-selection', selected.length > 0);
}

function filterEmployees(query) {
  const q = query.trim().toLowerCase();
  if (!q) return state.employees;
  return state.employees.filter(name => name.toLowerCase().includes(q));
}

function renderSearchOptions(names) {
  el.searchOptions.innerHTML = names.length
    ? names.map(name => `
        <div class="combobox-option${state.names.has(name) ? ' combobox-option-checked' : ''}" data-name="${escapeHtml(name)}">
          <span class="combobox-checkbox"></span>${escapeHtml(name)}
        </div>
      `).join('')
    : '<div class="combobox-empty">No matching names</div>';
}

// Multi-select, same pattern as the day filter: toggling a team keeps the
// dropdown open; "All teams" clears the selection and closes it.
function setupTeamFilter() {
  renderTeamFilterOptions();
  updateTeamFilterTrigger();

  el.teamFilterTrigger.addEventListener('click', () => {
    el.teamFilterOptions.classList.toggle('hidden');
  });
  el.teamFilterOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.combobox-option');
    if (!option) return;
    const team = option.dataset.value;
    if (!team) {
      state.teams.clear();
      renderTeamFilterOptions();
      el.teamFilterOptions.classList.add('hidden');
    } else {
      if (state.teams.has(team)) state.teams.delete(team);
      else state.teams.add(team);
      option.classList.toggle('combobox-option-checked', state.teams.has(team));
    }
    updateTeamFilterTrigger();
    applyFilters();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#teamFilterSelect')) el.teamFilterOptions.classList.add('hidden');
  });
}

function renderTeamFilterOptions() {
  el.teamFilterOptions.innerHTML = [`<div class="combobox-option combobox-option-clear" data-value="">All teams</div>`]
    .concat(state.teamsList.map(team => `
      <div class="combobox-option${state.teams.has(team) ? ' combobox-option-checked' : ''}" data-value="${escapeHtml(team)}">
        <span class="combobox-checkbox"></span>${teamIconHtml()}${escapeHtml(team)}
      </div>
    `))
    .join('');
}

function updateTeamFilterTrigger() {
  const selected = state.teamsList.filter(t => state.teams.has(t));
  el.teamFilterTrigger.classList.toggle('placeholder', selected.length === 0);
  if (selected.length === 0) {
    setTriggerText(el.teamFilterTrigger, 'All teams');
  } else if (selected.length === 1) {
    setTriggerText(el.teamFilterTrigger, selected[0]);
  } else {
    setTriggerText(el.teamFilterTrigger, `${selected.length} teams selected`);
  }
}

// Multi-select, same pattern as the day/team filters: toggling a dish keeps
// the dropdown open; "All dishes" clears the selection and closes it.
function setupItemFilter() {
  renderItemFilterOptions();
  updateItemFilterTrigger();

  el.itemFilterTrigger.addEventListener('click', () => {
    el.itemFilterOptions.classList.toggle('hidden');
  });
  el.itemFilterOptions.addEventListener('click', (e) => {
    const option = e.target.closest('.combobox-option');
    if (!option) return;
    const item = option.dataset.value;
    if (!item) {
      state.items.clear();
      renderItemFilterOptions();
      el.itemFilterOptions.classList.add('hidden');
    } else {
      if (state.items.has(item)) state.items.delete(item);
      else state.items.add(item);
      option.classList.toggle('combobox-option-checked', state.items.has(item));
    }
    updateItemFilterTrigger();
    applyFilters();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#itemFilterSelect')) el.itemFilterOptions.classList.add('hidden');
  });
}

function renderItemFilterOptions() {
  el.itemFilterOptions.innerHTML = [`<div class="combobox-option combobox-option-clear" data-value="">All dishes</div>`]
    .concat(state.itemsList.map(item => `
      <div class="combobox-option${state.items.has(item) ? ' combobox-option-checked' : ''}" data-value="${escapeHtml(item)}">
        <span class="combobox-checkbox"></span>${dishEmojiHtml(item)}${escapeHtml(item)}
      </div>
    `))
    .join('');
}

function updateItemFilterTrigger() {
  const selected = state.itemsList.filter(i => state.items.has(i));
  el.itemFilterTrigger.classList.toggle('placeholder', selected.length === 0);
  if (selected.length === 0) {
    setTriggerText(el.itemFilterTrigger, 'All dishes');
  } else if (selected.length === 1) {
    setTriggerText(el.itemFilterTrigger, selected[0]);
  } else {
    setTriggerText(el.itemFilterTrigger, `${selected.length} dishes selected`);
  }
}

// Sorted highest-count-first so the most-ordered dish reads first — the
// primary use of this page is calling in vendor totals for the week.
function totalsChipsHtml(orders) {
  const counts = {};
  orders.forEach(o => { counts[o.item] = (counts[o.item] || 0) + 1; });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([item, c]) => `<div class="totals-chip" data-tooltip="${escapeHtml(item)} · ${c} order${c === 1 ? '' : 's'}">${dishEmojiHtml(item)}<span class="totals-item">${escapeHtml(item)}</span><span class="totals-count">×${c}</span></div>`)
    .join('');
}

// Clicking a (non-featured) day's footer toggles its detail list — a
// "Show orders" pill sits as its own footer row below the totals so the
// affordance is obvious without cluttering the heading. The featured day
// has no toggle and stays expanded. While any filter is active, every day is
// forced open (see applyFilters) and this toggle is disabled.
function setupDayToggles() {
  el.summaryDays.addEventListener('click', (e) => {
    const sectionToggle = e.target.closest('.day-section-divider');
    if (sectionToggle) {
      const section = sectionToggle.dataset.section;
      state.sectionExpanded[section] = !state.sectionExpanded[section];
      sectionToggle.setAttribute('aria-expanded', state.sectionExpanded[section] ? 'true' : 'false');
      sectionToggle.nextElementSibling?.classList.toggle('hidden', !state.sectionExpanded[section]);
      return;
    }
    if (state.filterActive) return;
    const footer = e.target.closest('.day-card-footer');
    if (!footer) return;
    const dayBlock = footer.closest('.day-block');
    if (!dayBlock || dayBlock.dataset.featured === 'true') return;
    const date = dayBlock.dataset.date;
    state.expanded[date] = !state.expanded[date];
    setDayExpanded(dayBlock, state.expanded[date]);
  });
}

function setDayExpanded(dayBlock, expanded) {
  const summaryDay = dayBlock.querySelector('.summary-day');
  if (!summaryDay) return;
  summaryDay.classList.toggle('hidden', !expanded);
  dayBlock.classList.toggle('expanded', expanded);
}

async function renderSummary(employees) {
  const perDate = await Promise.all(state.dates.map(async date => {
    const orders = await Api.getOrdersForDate(date);
    orders.forEach(o => { o.team = teamOf(employees, o.employee); });
    return { date, orders };
  }));

  // Tomorrow's day always renders first, expanded — falls back to the last
  // day of the week if the whole week is already in the past. Any day before
  // it (including today, whose ordering window and lunch are both already
  // done) is pulled out into its own trailing section, separated by a
  // divider, so the current/upcoming day stays the focus at the top.
  // Clamped to the day before this week starts: if an admin has pointed the
  // app at a future week, real "today" is earlier than the whole week, so
  // this floor keeps every day of it "upcoming" instead of comparing against
  // a today that hasn't reached the week yet.
  const today = [toDateStr(new Date()), addDays(state.dates[0], -1)].sort().pop();
  const upcomingDate = state.dates.find(d => d > today) || state.dates[state.dates.length - 1];
  const upcomingIndex = state.dates.indexOf(upcomingDate);
  const past = perDate.filter((p, i) => i < upcomingIndex);
  const rest = perDate.filter((p, i) => i >= upcomingIndex);
  const ordered = [
    ...rest.filter(p => p.date === upcomingDate),
    ...rest.filter(p => p.date !== upcomingDate),
    ...past,
  ];

  const fragment = document.createDocumentFragment();
  const makeSectionDivider = (section, label) => {
    const divider = document.createElement('button');
    divider.type = 'button';
    divider.className = 'day-section-divider';
    divider.dataset.section = section;
    divider.setAttribute('aria-expanded', state.sectionExpanded[section] ? 'true' : 'false');
    divider.innerHTML = `<span>${label}</span>`;
    fragment.appendChild(divider);
    const group = document.createElement('div');
    group.className = `day-section-group${state.sectionExpanded[section] ? '' : ' hidden'}`;
    fragment.appendChild(group);
    return group;
  };

  let upcomingDividerAdded = false;
  let upcomingGroup = null;
  let pastDividerAdded = false;
  let pastGroup = null;
  for (const { date, orders } of ordered) {
    const featured = date === upcomingDate;
    const isPast = state.dates.indexOf(date) < upcomingIndex;
    state.ordersByDate[date] = orders;

    if (!featured && !isPast && !upcomingDividerAdded) {
      upcomingDividerAdded = true;
      upcomingGroup = makeSectionDivider('upcoming', 'Upcoming days');
    }
    if (isPast && !pastDividerAdded) {
      pastDividerAdded = true;
      pastGroup = makeSectionDivider('past', 'Past days');
    }

    const { byTeam, teams } = groupByTeam(orders, employees);

    // Abbreviated ("Mon" not "Monday") so every heading is the same width —
    // full names of varying length made the headings ragged when panels are
    // stacked one-per-row (Wednesday/Thursday vs. the shorter weekdays).
    const dayLabel = `${weekdayLabel(date).slice(0, 3)}, ${date.slice(8, 10)}/${date.slice(5, 7)}`;
    const block = document.createElement('div');
    block.className = featured ? 'day-block expanded' : 'day-block';
    block.dataset.date = date;
    block.dataset.featured = featured ? 'true' : 'false';
    block.dataset.past = isPast ? 'true' : 'false';
    if (featured) state.expanded[date] = true;
    block.innerHTML = `
      ${orders.length ? `
        <div class="panel day-card">
          <div class="totals-header">
            <div>
              ${featured ? '<p class="eyebrow">Tomorrow</p>' : ''}
              <div class="day-heading-row">
                <h3 class="day-heading">${dayLabel}</h3>
              </div>
            </div>
            <span class="day-total"><strong>${orders.length}</strong><span class="day-total-label">Total order${orders.length === 1 ? '' : 's'}</span></span>
          </div>
          <div class="totals-panel">
            <p class="totals-label">Orders per dish</p>
            <div class="totals">${totalsChipsHtml(orders)}</div>
          </div>
          <div class="summary-day${featured ? '' : ' hidden'}">
            <div class="order-entries">
              ${teams.map(team => `
                <div class="team-group" data-team="${escapeHtml(team)}">
                  <p class="team-row">${teamIconHtml()}${escapeHtml(team)}</p>
                  ${byTeam.get(team).map(o => `
                    <div class="order-entry" data-employee="${escapeHtml(o.employee)}" data-item="${escapeHtml(o.item)}" data-tooltip="${escapeHtml(o.item)}">
                      <div class="order-entry-info">
                        <span class="order-entry-name">${escapeHtml(o.employee)}</span>
                        <span class="order-entry-dish">${dishEmojiHtml(o.item)}${escapeHtml(o.item)}</span>
                      </div>
                      <span class="order-entry-time"><span class="time-icon" aria-hidden="true">🕘</span>${formatSubmittedTime(o.timestamp)}</span>
                      ${IS_ADMIN ? `<button type="button" class="order-entry-del" data-date="${date}" data-employee="${escapeHtml(o.employee)}" aria-label="Delete ${escapeHtml(o.employee)}'s order">✕</button>` : ''}
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
            <div class="empty-state no-match hidden">
              <p class="empty-state-title">No matching orders</p>
              <p class="empty-state-sub">Try adjusting your search or filters.</p>
            </div>
          </div>
          ${featured ? '' : '<button type="button" class="day-card-footer"><span class="expand-hint"></span></button>'}
        </div>
      ` : `
        <div class="panel day-card">
          ${featured ? '<p class="eyebrow standalone">Tomorrow</p>' : ''}
          <h3 class="day-heading standalone">${dayLabel}</h3>
          <p class="status">No orders yet.</p>
        </div>
      `}
    `;
    const target = featured ? fragment : (isPast ? pastGroup : upcomingGroup);
    target.appendChild(block);
  }
  // Whole week empty → one friendly state instead of five "ghost town" cards.
  if (perDate.every(p => !p.orders.length)) {
    el.summaryDays.innerHTML = `
      <div class="empty-state empty-week">
        <p class="empty-state-title">No orders this week yet</p>
        <p class="empty-state-sub">When teammates place their lunch orders they'll appear here.</p>
      </div>`;
    renderWeekSummary(perDate);
    return;
  }
  el.summaryDays.innerHTML = '';
  el.summaryDays.appendChild(fragment);
  renderWeekSummary(perDate);
}

// At-a-glance week banner above the per-day cards: total orders + busiest day.
// Reflects the whole week (not the current filters).
function renderWeekSummary(perDate) {
  const total = perDate.reduce((sum, p) => sum + p.orders.length, 0);
  if (!total) { el.weekSummary.classList.add('hidden'); return; }
  const busiest = perDate.reduce((a, b) => (b.orders.length > a.orders.length ? b : a));
  const tile = (icon, value, label) => `
    <div class="stat-tile">
      <span class="stat-tile-icon" aria-hidden="true">${icon}</span>
      <span class="stat-tile-body">
        <span class="stat-tile-value">${value}</span>
        <span class="stat-tile-label">${escapeHtml(label)}</span>
      </span>
    </div>`;
  el.weekSummary.innerHTML = `<div class="stat-tiles" id="weekStats">
    ${tile('🍽️', total, total === 1 ? 'order this week' : 'orders this week')}
    ${tile('🔥', busiest.orders.length, `busiest — ${formatDate(busiest.date)}`)}
  </div>`;
  el.weekSummary.classList.remove('hidden');
}

function applyFilters() {
  const search = el.searchInput.value.trim().toLowerCase();
  // Checked names take priority as the real filter; the typed text only
  // does a direct substring search when nothing is checked yet.
  const nameFilterActive = state.names.size > 0 || !!search;
  const filterActive = nameFilterActive || state.teams.size > 0 || state.days.size > 0 || state.items.size > 0;
  state.filterActive = filterActive;
  let weekVisible = 0;

  document.querySelectorAll('.day-block').forEach(dayBlock => {
    const dayMatches = state.days.size === 0 || state.days.has(dayBlock.dataset.date);
    dayBlock.classList.toggle('hidden', !dayMatches);
    if (!dayMatches) return;

    let anyVisible = false;
    let visibleCount = 0;
    dayBlock.querySelectorAll('.team-group').forEach(group => {
      const teamMatches = state.teams.size === 0 || state.teams.has(group.dataset.team);
      let groupVisible = false;
      group.querySelectorAll('.order-entry').forEach(entry => {
        const employee = entry.dataset.employee;
        const nameMatches = state.names.size > 0
          ? state.names.has(employee)
          : (!search || employee.toLowerCase().includes(search));
        const itemMatches = state.items.size === 0 || state.items.has(entry.dataset.item);
        const visible = teamMatches && nameMatches && itemMatches;
        entry.classList.toggle('hidden', !visible);
        if (visible) { groupVisible = true; visibleCount++; }
      });
      group.classList.toggle('hidden', !groupVisible);
      if (groupVisible) anyVisible = true;
    });

    const noMatch = dayBlock.querySelector('.no-match');
    if (noMatch) noMatch.classList.toggle('hidden', anyVisible);
    updateTotalsPanel(dayBlock, nameFilterActive, visibleCount);
    weekVisible += visibleCount;

    // A filter match takes priority so results are visible without a manual
    // click; clearing all filters reverts each day to its own toggle state.
    // The expand-hint icon only makes sense when the toggle is actually usable.
    setDayExpanded(dayBlock, filterActive || !!state.expanded[dayBlock.dataset.date]);
    const expandHint = dayBlock.querySelector('.expand-hint');
    if (expandHint) expandHint.classList.toggle('icon-hidden', filterActive);
  });

  // Nothing matches anywhere → collapse the empty day cards and show a single
  // week-level message, instead of repeating "no matching orders" on each day.
  const noneVisible = filterActive && weekVisible === 0;
  if (noneVisible) document.querySelectorAll('.day-block').forEach(b => b.classList.add('hidden'));

  document.querySelectorAll('.day-section-divider').forEach(divider => {
    const section = divider.dataset.section;
    const group = divider.nextElementSibling;
    const anySectionVisible = group
      ? [...group.querySelectorAll('.day-block')].some(b => !b.classList.contains('hidden'))
      : false;
    divider.classList.toggle('hidden', !anySectionVisible);
    // A filter match forces the (possibly collapsed) section open so the
    // result is visible without an extra click; clearing filters reverts it
    // to whatever the user last set the collapse toggle to.
    const forceOpen = filterActive || state.sectionExpanded[section];
    divider.setAttribute('aria-expanded', forceOpen ? 'true' : 'false');
    group?.classList.toggle('hidden', !forceOpen);
  });

  el.clearFiltersBtn.classList.toggle('hidden', !filterActive);
  el.noResultsAll.classList.toggle('hidden', !noneVisible);

  syncFiltersToUrl();
}

function updateTotalsPanel(dayBlock, nameFilterActive, visibleCount) {
  // The day-total badge reflects what's actually visible under the current
  // filters — including a name/search match — even though the dish-totals
  // breakdown below it only makes sense when no name filter narrows the list.
  const dayTotal = dayBlock.querySelector('.day-total');
  if (dayTotal) dayTotal.innerHTML = `<strong>${visibleCount}</strong><span class="day-total-label">Total order${visibleCount === 1 ? '' : 's'}</span>`;

  const totalsPanel = dayBlock.querySelector('.totals-panel');
  if (!totalsPanel) return;

  if (nameFilterActive) {
    totalsPanel.classList.add('hidden');
    return;
  }

  const orders = state.ordersByDate[dayBlock.dataset.date] || [];
  const scoped = orders.filter(o => (!state.teams.size || state.teams.has(o.team)) && (!state.items.size || state.items.has(o.item)));
  if (!scoped.length) {
    totalsPanel.classList.add('hidden');
    return;
  }

  totalsPanel.querySelector('.totals').innerHTML = totalsChipsHtml(scoped);
  totalsPanel.classList.remove('hidden');
}

init();
