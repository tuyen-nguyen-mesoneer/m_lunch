function getOverlay() {
  let overlay = document.getElementById('confirmOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'confirmOverlay';
    overlay.className = 'confirm-overlay hidden';
    overlay.innerHTML = `
      <div class="panel confirm-dialog">
        <p class="eyebrow confirm-eyebrow">Confirm</p>
        <p class="confirm-message"></p>
        <div class="button-row">
          <button type="button" class="secondary confirm-cancel">Cancel</button>
          <button type="button" class="primary confirm-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  return overlay;
}

// Tracks whichever confirmDialog() call is currently showing, so a new call
// can cancel it first (see below) instead of stacking a second set of
// listeners on the same shared overlay/buttons.
let activeCleanup = null;

// Resolves true/false rather than throwing/blocking like window.confirm —
// callers can await it inline before an add/remove action goes to Firestore.
export function confirmDialog(message, { title = 'Confirm', confirmLabel = 'OK', danger = false, messageHtml = null } = {}) {
  // If a previous call is still pending (triggered again before the user
  // answered it — e.g. clicking "+" on two teams back-to-back), cancel it
  // first. Otherwise its listeners linger on the shared buttons and, since
  // they were never removed, fire alongside the new dialog's — silently
  // resolving that old, now-invisible request too when the user clicks
  // Add/Cancel on what looks like a single, fresh dialog.
  if (activeCleanup) activeCleanup(false);

  const overlay = getOverlay();
  overlay.querySelector('.confirm-eyebrow').textContent = danger ? 'Warning' : title;
  // messageHtml lets callers emphasize parts (e.g. a name) — they MUST escape
  // any user data themselves; plain `message` stays textContent (injection-safe).
  const msgEl = overlay.querySelector('.confirm-message');
  if (messageHtml != null) msgEl.innerHTML = messageHtml; else msgEl.textContent = message;
  const okBtn = overlay.querySelector('.confirm-ok');
  const cancelBtn = overlay.querySelector('.confirm-cancel');
  okBtn.textContent = confirmLabel;
  okBtn.classList.toggle('danger', danger);
  overlay.querySelector('.confirm-dialog').classList.toggle('danger', danger);
  overlay.classList.remove('hidden');

  // Whatever had focus before the dialog opened (e.g. the "+" or remove
  // button that triggered it) so it can be restored on close, and so Tab
  // starts from the dialog's own buttons rather than wherever focus was
  // left on the page behind the overlay.
  const previouslyFocused = document.activeElement;
  // Defer focus past the current keyboard event cycle. If the dialog is opened
  // via an Enter keydown, moving focus synchronously causes the browser to fire
  // a click on cancelBtn on keyup (Enter activates buttons on keyup), instantly
  // closing the dialog before the user sees it.
  requestAnimationFrame(() => cancelBtn.focus());

  return new Promise(resolve => {
    const cleanup = (result) => {
      activeCleanup = null;
      overlay.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
      resolve(result);
    };
    activeCleanup = cleanup;
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === overlay) cleanup(false); };
    // Escape cancels; Tab is trapped between the two buttons (only
    // focusable things in the dialog) so it can't escape to the page
    // underneath the overlay while it's open.
    const onKey = (e) => {
      if (e.key === 'Escape') { cleanup(false); return; }
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === cancelBtn) {
        e.preventDefault();
        okBtn.focus();
      } else if (!e.shiftKey && document.activeElement === okBtn) {
        e.preventDefault();
        cancelBtn.focus();
      }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}
