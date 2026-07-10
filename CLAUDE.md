# m_lunch — project guide

Weekly team-lunch ordering app. Employees pick a dish for each
weekday; the kitchen/admin sees the week's orders and manages the menu + roster.
Internal, trust-based tool (no real auth).

## Golden rules

1. **Read before you edit.** Read the file first; before changing a function,
   grep for every caller. The CSS and the JS DOM-generation strings are tightly
   coupled — a class/id/`data-*` used in CSS is almost always produced by JS.
2. **Never break business logic.** Ordering, cutoff/lock timing, week rollover,
   Firestore reads/writes, and the admin flows are load-bearing. Redesigns and
   tweaks change *presentation only* unless the task is explicitly about logic.
3. **Preserve the JS hooks.** When you restyle or re-mark-up a page, keep every
   class / id / `data-*` attribute the JS queries, or update both sides in
   lockstep. Verify with grep across `js/`.
4. **No build step, no new dependencies.** This is a buildless static site.

## Architecture

- **Buildless static site.** Plain HTML + CSS + native ES modules. No framework,
  no bundler, no npm. Deployed via GitHub Pages off `main`.
- **Pages** (each standalone, its own `<head>`/masthead): `index.html` (order),
  `orders.html` (week report), `admin.html` (menu + roster + summary),
  `login.html` (admin gate — no masthead).
- **One stylesheet:** `css/style.css`, driven entirely by CSS custom-property
  tokens defined at the top.
- **JS modules** (`js/`): `employee.js` (order page), `orders.js` (report),
  `admin.js` + `adminSession.js` (admin), `login.js` (gate), `api.js`
  (Firestore data access), `firebase.js` + `config.js` (Firebase init +
  `CUTOFF_HOUR`), `dateUtils.js` (week/date math), `teamGroup.js`, `snackbar.js`,
  `confirmDialog.js`, `datePicker.js` (custom date/month picker), `theme.js`
  (shared light/dark toggle), `domUtils.js`.
- **Data:** Firebase Firestore. Collections: `config` (`currentWeek`,
  `adminAuth`), `employees`, `menu/{date}`, `orders/{date}/entries/{employee}`.
  Rules are intentionally open (`firestore.rules`) — trust-based tool; admin
  login is a plaintext `config/adminAuth` doc checked client-side. Orders are
  kept indefinitely (report history); only the menu clears on week rollover.

## Design & UX principles (this is what "good" means here)

The brief: **professional and polished, brand-aligned to mesoneer.io** — not
playful/mascot-y. An earlier "fun/colorful" brief (bobbing mascot, confetti,
Baloo 2/Quicksand) was explicitly reversed; do not reintroduce mascot,
confetti, or emoji decoration unless asked.

- **Show everything users need up front.** No hidden essentials. The order page
  surfaces the whole week at a glance (5-day grid), the payment/house
  rule, a live progress meter, and clear lock states. Prefer progressive
  disclosure (expand/collapse) only for secondary detail, never for the core task.
- **Minimal, functional motion only.** No entrance/stagger/decorative
  animation. Transitions exist only for hover, focus, and explicit state
  changes (tab switch, theme toggle, expand/collapse) at ~120-150ms. Every
  transition still respects `@media (prefers-reduced-motion: reduce)`.
- **Light + dark mode, default dark.** Full theming via tokens: `:root`
  (light) + overrides under `@media (prefers-color-scheme: dark)` and under
  `:root[data-theme="dark"]` / `[data-theme="light"]` (the toggle wins both
  ways). A `<head>` snippet on every page sets `data-theme` from
  `localStorage["mlunch-theme"]`, **defaulting to `"dark"`** when unset (we do
  NOT auto-follow the OS). `theme.js` builds the toggle and persists the choice.
  Style through tokens only — no hard-coded colors in components.
- **Desktop + mobile only. No tablet tier.** Breakpoints: desktop is the
  default; `≤640px` is the phone layout; there are a couple of mid-width
  *reflow* points (~820/~900/~400px) purely for grid column counts. Do **not**
  add a dedicated tablet design.
- **Readability first.** Dish/menu names run long — let text wrap (2-line clamp
  on the dish trigger, wrapping dropdown options) rather than truncating; give
  content room. Bright hues are decorative; body text uses AA-verified `-deep`
  color variants; white-on-color uses `--red-fill` / `--cta-*`.
- **Not flat/blank.** Don't leave large surfaces (hero banners, page
  background, the login card) as plain `--surface`/`--bg` — use a subtle
  gradient or `color-mix()` wash of `--accent` (or, for day/team-scoped cards,
  their own `--day`/`--team` color) at low opacity (~4-14%) so the page
  doesn't read as flat white/near-white. This is still "no new colors" — reuse
  the existing accent/weekday/team palette as fills, not just border accents.
- **Accessible.** Real focus states (`:focus-visible`), `aria-*` on toggles and
  nav, alt text, keyboard-usable custom comboboxes. Keep it that way.

## Design tokens (in `css/style.css`)

- **Fonts:** Open Sans for both `--ff-display` (headings/wordmark) and
  `--ff-body`, loaded from Google Fonts. Add no new font machinery.
- **Neutrals:** `--bg`, `--bg2`, `--surface`, `--surface-2`, `--ink`, `--muted`,
  `--faint`, `--hair`, `--line-soft`.
- **Brand/accent:** single mesoneer violet accent — `--accent`, `--accent-deep`,
  `--accent-wash` (+ `-wash-line`); CTA `--cta-a`/`--cta-b`/`--cta-ink`;
  `--red-fill` for white-text danger pills. Light mode: near-black-purple ink
  `#191528` on off-white surfaces. Dark mode: background is literally
  mesoneer's `#191528`, with a light-lavender accent (`#C39BFF`).
- **Weekday/team accent — single violet, no rainbow.** `--mon --tue --wed --thu
  --fri --grape` (+ `-deep` AA variants) all resolve to `var(--accent)` /
  `var(--accent-deep)` — one brand accent everywhere a day or team needs a
  color, matching mesoneer.io (which has no per-day color system, only its one
  violet). This was a deliberate reversal (2026-07-19) of an earlier "weekday
  rainbow" design where each day/team had a distinct hue; do not reintroduce
  distinct per-day hues unless asked. Cards still receive their accent via a
  local `--day` / `--day-deep` (or `--team` / `--team-deep`) custom property
  (nth-child-assigned per day/team in CSS) — that plumbing is unchanged, only
  the weekday-token *values* were collapsed to the single accent, so the JS
  and per-row `--day` assignment logic didn't need to change. Used both for a
  border/left-accent AND a low-opacity `color-mix()` background wash.
- **Semantic:** `--ok --warn --bad` (+ `-wash` tints).
- **Shape/other:** radii `--r-lg/--r/--r-sm/--pill` are all `0` (crisp,
  near-sharp corners, not rounded); shadows `--sh/--sh-lg`; mono `--ff-mono`
  for figures/dates.

Every one of these is redefined for dark mode — when you add a color token,
add its dark value too (in all of `:root`, the `@media (prefers-color-scheme:
dark)` block, and both `[data-theme]` override blocks — four places).

## Interaction patterns to keep

- **Custom combobox** (name picker, dish pickers, multi-select filters) is the
  established multi-select pattern. Keep it — do **not** swap to native
  `<select>` (rewriting the interaction JS risks business logic; native
  multi-select UX is poor). Restyle freely; keep big tap targets.
- Feedback via `snackbar.js` (toasts) and `confirmDialog.js` (confirms). Reuse
  them; don't invent new modal/toast mechanisms.

## Verifying changes

- Preview locally: `./server.sh [port]` (defaults to 8000) → serves the static
  site. `node --check js/<file>.js` for a quick JS syntax check.
- After layout/CSS work, actually look at it in a browser at **both** a desktop
  and a phone width, in **both** themes, and test long dish names — this app's
  bugs are visual (clipping, truncation, contrast), not just logical.
