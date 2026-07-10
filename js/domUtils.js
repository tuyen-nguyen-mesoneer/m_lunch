export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Shared decorative glyphs used to prefix team and day labels everywhere they
// appear (filters, headers).
export const TEAM_ICON = '🤝';
export const DAY_ICON = '📅';
export function teamIconHtml() {
  return `<span class="team-icon" aria-hidden="true">${TEAM_ICON}</span>`;
}
export function dayIconHtml() {
  return `<span class="day-icon" aria-hidden="true">${DAY_ICON}</span>`;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Traps Tab/Shift+Tab within `overlay` while it's open (so keyboard focus
// can't wander into the page hidden behind it) and, on the returned cleanup
// call, restores focus to whatever had it before the overlay opened. Mirrors
// the trap confirmDialog.js has always had, factored out so every modal gets
// the same behavior instead of each reimplementing it.
export function trapOverlayFocus(overlay, { initialFocus } = {}) {
  const previouslyFocused = document.activeElement;
  const focusables = () =>
    Array.from(overlay.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => el.offsetParent !== null);

  const onKeydown = (e) => {
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  overlay.addEventListener('keydown', onKeydown);

  // Deferred past the current keyboard event cycle — if the overlay was
  // opened via an Enter keydown, focusing synchronously would let the browser
  // fire a click on the newly-focused button on keyup, closing it instantly.
  // setTimeout (not requestAnimationFrame) so this still runs in
  // backgrounded/unpainted tabs.
  setTimeout(() => (initialFocus || focusables()[0])?.focus(), 0);

  return function releaseOverlayFocusTrap() {
    overlay.removeEventListener('keydown', onKeydown);
    // Restore to whatever opened the overlay — except document.body, which
    // isn't really "focus" (there was nothing focused before, e.g. the
    // house-rule popup that shows on page load) and calling .focus() on it
    // is a no-op that would leave focus stranded on the now-hidden overlay.
    if (previouslyFocused && previouslyFocused !== document.body) previouslyFocused.focus();
    else document.activeElement?.blur?.();
  };
}
