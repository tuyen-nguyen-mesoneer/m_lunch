let hideTimer = null;

function getContainer() {
  let el = document.getElementById('snackbar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'snackbar';
    el.className = 'snackbar';
    document.body.appendChild(el);
  }
  return el;
}

// `message` is treated as HTML (not plain text) so callers can wrap dynamic
// values in <strong> for emphasis — see escapeHtml() in domUtils.js for
// safely embedding user-provided values (names, teams) inside it.
export function showSnackbar(message, isError = false) {
  const el = getContainer();
  // Wrapped in one span so the whole message is a single flex item — .snackbar
  // is a flex row with `gap` for spacing its icon from the text, and without
  // this wrapper every text run and <strong> in `message` would become its
  // own direct flex child and get that same gap inserted between them.
  el.innerHTML = `<span class="snackbar-text">${message}</span>`;
  el.classList.toggle('error', isError);
  el.classList.add('visible');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('visible'), 3800);
}
