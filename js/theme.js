// Shared light/dark theme control.
//
// A tiny inline snippet in each page's <head> sets data-theme before first
// paint (no flash) from the saved choice. This module builds the sun/moon
// toggle, keeps it in sync, and persists the pick.
//
// The toggle drops into the masthead nav where one exists; on the login gate
// (which has no masthead) it floats in the top-right corner instead.

const KEY = 'mlunch-theme';
const root = document.documentElement;

function save(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode — no-op */ }
}
function current() {
  // Dark is the default; the <head> snippet always sets an explicit attribute.
  return root.getAttribute('data-theme') || 'dark';
}

let btn;

function sync(theme) {
  if (!btn) return;
  const dark = theme === 'dark';
  btn.setAttribute('aria-pressed', String(dark));
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  const glyph = btn.querySelector('.theme-toggle-glyph');
  if (glyph) glyph.textContent = dark ? '☀️' : '🌙'; // show the action's icon
}

function apply(theme) {
  root.setAttribute('data-theme', theme);
  save(theme);
  sync(theme);
}

function build() {
  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle';
  // A simple icon button — shows the icon for the mode you'll switch to.
  btn.innerHTML = '<span class="theme-toggle-glyph" aria-hidden="true">🌙</span>';
  btn.addEventListener('click', () => {
    apply(current() === 'dark' ? 'light' : 'dark');
  });

  const nav = document.querySelector('.masthead-nav');
  if (nav) {
    nav.appendChild(btn);
    setupMobileNav(nav);
  } else {
    btn.classList.add('theme-toggle-floating');
    document.body.appendChild(btn);
  }
  sync(current());
}

// On phones the nav (Order/Orders/Admin + theme toggle) collapses behind a
// hamburger. CSS handles show/hide by width; this just wires the toggle and
// closes the menu after a link is tapped.
function setupMobileNav(nav) {
  const masthead = nav.closest('.masthead');
  if (!masthead || masthead.querySelector('.masthead-hamburger')) return;
  const burger = document.createElement('button');
  burger.type = 'button';
  burger.className = 'masthead-hamburger';
  burger.setAttribute('aria-label', 'Menu');
  burger.setAttribute('aria-expanded', 'false');
  burger.innerHTML = '<span></span><span></span><span></span>';
  const setOpen = (open) => {
    masthead.classList.toggle('nav-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!masthead.classList.contains('nav-open')); });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.masthead')) setOpen(false); });
  masthead.appendChild(burger);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', build);
} else {
  build();
}
