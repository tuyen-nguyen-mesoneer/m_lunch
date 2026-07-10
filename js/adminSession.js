const SESSION_KEY = 'lunchAdminOk';

export function isAdminAuthenticated() {
  return localStorage.getItem(SESSION_KEY) === '1';
}

export function setAdminAuthenticated() {
  localStorage.setItem(SESSION_KEY, '1');
}
