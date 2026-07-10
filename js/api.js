// Firestore-backed data access. Replaces the old Apps Script JSON API.
// Trust model: Firestore rules (see firestore.rules) allow open read/write,
// same soft-trust posture as the old PIN-gated Apps Script backend.

import { db } from './firebase.js';
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { weekDates, currentTargetWeekStart, addDays, hasWeekRolledOver } from './dateUtils.js';

const weekConfigRef = doc(db, 'config', 'currentWeek');

// Only the menu is cleared on rollover — orders are kept indefinitely so
// the admin order-summary report has history to add up.
async function clearWeekData(weekStart) {
  for (const date of weekDates(weekStart)) {
    await deleteDoc(doc(db, 'menu', date));
  }
}

// Call on page load. Advances the stored week one rollover at a time (in a
// loop, so a long gap with no visits still catches all the way up in one
// call) whenever the *stored* week's own Friday cutoff has passed — not
// whenever it merely differs from today's computed week, so an admin's
// manual week override (see setCurrentWeek) sticks until it naturally rolls
// over instead of being reverted on the very next page load.
async function ensureCurrentWeek() {
  const snap = await getDoc(weekConfigRef);
  let stored = snap.exists() ? snap.data().weekStart : null;
  if (!stored) {
    stored = currentTargetWeekStart();
    await setDoc(weekConfigRef, { weekStart: stored });
    return stored;
  }
  let next = stored;
  while (hasWeekRolledOver(next)) {
    await clearWeekData(next);
    next = addDays(next, 7);
  }
  if (next !== stored) await setDoc(weekConfigRef, { weekStart: next });
  return next;
}

export const Api = {
  ensureCurrentWeek,

  // Admin override: point the app at an arbitrary Monday-starting week.
  // Non-destructive — unlike the automatic weekly rollover, this never
  // clears menu data, so switching back and forth doesn't lose anything.
  setCurrentWeek: async (weekStart) => {
    await setDoc(weekConfigRef, { weekStart });
    return weekStart;
  },

  getAdminAuth: async () => {
    const snap = await getDoc(doc(db, 'config', 'adminAuth'));
    return snap.exists() ? snap.data() : null;
  },

  getEmployees: async () => {
    const snap = await getDocs(collection(db, 'employees'));
    return snap.docs.map(d => ({ id: d.id, name: d.data().name, team: d.data().team || '' }));
  },

  addEmployee: (name, team) => addDoc(collection(db, 'employees'), { name, team: team || '' }),

  updateEmployeeName: (id, name) => updateDoc(doc(db, 'employees', id), { name }),

  removeEmployee: (id) => deleteDoc(doc(db, 'employees', id)),

  getMenu: async (date) => {
    const snap = await getDoc(doc(db, 'menu', date));
    return snap.exists() ? (snap.data().items || []) : [];
  },

  setMenu: (date, items) => setDoc(doc(db, 'menu', date), { items }),

  // A "Skipping lunch" entry is a real doc (`skipped:true`, no `item`) so it
  // round-trips distinctly from "never touched" — but it's not an actual
  // order, so every report-facing read here excludes it.
  getOrdersForDate: async (date) => {
    const snap = await getDocs(collection(db, 'orders', date, 'entries'));
    return snap.docs
      .filter(d => !d.data().skipped)
      .map(d => ({ employee: d.id, item: d.data().item, timestamp: d.data().timestamp || null }));
  },

  getOrderForEmployee: async (date, employee) => {
    const snap = await getDoc(doc(db, 'orders', date, 'entries', employee));
    return snap.exists() ? snap.data() : null;
  },

  submitOrder: (date, employee, item) =>
    setDoc(doc(db, 'orders', date, 'entries', employee), { item, timestamp: serverTimestamp() }),

  // Distinct from removeOrder: records that the employee deliberately opted
  // out for this day, so re-opening their order shows "Skipping lunch"
  // instead of "Not ordered yet". Excluded from every report read above.
  skipOrder: (date, employee) =>
    setDoc(doc(db, 'orders', date, 'entries', employee), { item: '', skipped: true, timestamp: serverTimestamp() }),

  removeOrder: (date, employee) =>
    deleteDoc(doc(db, 'orders', date, 'entries', employee)),

  // Per-day totals for the admin summary. Skipped entries are real docs now,
  // so a server-side count would over-count them — fetch and filter instead
  // of the cheaper getCountFromServer.
  getOrderCountsInRange: async (dates) => Promise.all(dates.map(async date => {
    const snap = await getDocs(collection(db, 'orders', date, 'entries'));
    return { date, count: snap.docs.filter(d => !d.data().skipped).length };
  })),
};
