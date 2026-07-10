import { Api } from './api.js';
import { isAdminAuthenticated, setAdminAuthenticated } from './adminSession.js';

const el = {
  gateScreen: document.getElementById('gateScreen'),
  gateForm: document.getElementById('gateForm'),
  usernameInput: document.getElementById('usernameInput'),
  passwordInput: document.getElementById('passwordInput'),
  pinBtn: document.getElementById('pinBtn'),
  pinError: document.getElementById('pinError'),
};

if (isAdminAuthenticated()) {
  // Already signed in this session — skip straight to the admin page
  // instead of flashing the login form first.
  window.location.replace('admin.html');
} else {
  el.gateScreen.classList.remove('hidden');
  el.usernameInput.focus();

  const updateSubmitState = () => {
    el.pinBtn.disabled = !el.usernameInput.value.trim() || !el.passwordInput.value.trim();
  };
  updateSubmitState();
  el.usernameInput.addEventListener('input', updateSubmitState);
  el.passwordInput.addEventListener('input', updateSubmitState);

  el.gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.pinBtn.disabled = true;
    el.pinBtn.textContent = 'Signing in…';
    el.pinError.textContent = '';
    try {
      const auth = await Api.getAdminAuth();
      if (!auth) {
        el.pinError.textContent = 'Administrator login is not configured. Please contact IT.';
        return;
      }
      const username = el.usernameInput.value.trim();
      const password = el.passwordInput.value.trim();
      if (username === auth.username && password === auth.password) {
        setAdminAuthenticated();
        window.location.replace('admin.html');
      } else {
        el.pinError.textContent = 'Incorrect username or password.';
      }
    } catch (err) {
      el.pinError.textContent = 'Unable to reach the server. Please check your connection and try again.';
    } finally {
      updateSubmitState();
      el.pinBtn.textContent = 'Sign in';
    }
  });
}
