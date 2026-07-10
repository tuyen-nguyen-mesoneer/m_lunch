<p align="center">
  <img src="assets/img/logo.svg" width="96" height="96" alt="m_lunch logo">
</p>

<h1 align="center">m_lunch</h1>

<p align="center">A playful weekly team-lunch ordering app — pick a dish for each weekday, and let the kitchen see who's eating what.</p>

---

## What it is

**m_lunch** is a small internal tool for a team's weekly lunch:

- **Order lunch** (`index.html`) — pick your name and choose a dish for each weekday. Days lock at a daily cutoff.
- **Orders** (`orders.html`) — the week at a glance: per-day breakdown, per-dish counts, filter by day / team / dish / name.
- **Admin** (`admin.html`) — set the week's menu (paste a Mon–Fri block straight from Google Sheets), review an order summary, and manage the roster. Gated by a simple staff sign-in (`login.html`).

The UI is intentionally colorful and animated, with full **light + dark** themes (toggle in the header) and a mobile layout. Motion respects `prefers-reduced-motion`.

## Tech stack

- **Buildless static site** — plain HTML, CSS, and native ES modules. No framework, no bundler, no build step.
- **Firebase Firestore** for data ([`firestore.rules`](firestore.rules)). Config lives in [`js/config.js`](js/config.js).
- **GitHub Pages** hosting, deployed off `main`.
- Fonts: Baloo 2 + Quicksand (Google Fonts).

## Project structure

```text
m_lunch/
├── index.html            # Order lunch — pick a dish per weekday
├── orders.html           # Orders — the week at a glance
├── admin.html            # Admin — menu · reports · roster
├── login.html            # Staff sign-in gate
│
├── css/
│   └── style.css         # token-driven stylesheet (light + dark)
│
├── js/
│   ├── employee.js       # order page logic
│   ├── orders.js         # report page logic
│   ├── admin.js          # admin page logic
│   ├── login.js          # sign-in logic
│   ├── api.js            # Firestore data access
│   ├── firebase.js       # Firebase init
│   ├── config.js         # project config + cutoff hour
│   ├── theme.js          # light/dark toggle + mobile nav
│   ├── confetti.js       # celebration burst
│   ├── snackbar.js       # toasts
│   ├── confirmDialog.js  # confirm modals
│   ├── dateUtils.js      # week / cutoff math
│   ├── teamGroup.js      # roster grouping
│   └── domUtils.js       # tiny DOM helpers
│
├── assets/img/
│   ├── logo.svg          # brand mark
│   └── momo-qr.png       # MoMo payment QR
├── favicon.svg
│
├── firestore.rules       # Firestore security rules
├── firebase.json         # Firebase config
└── server.sh             # local static server
```

## Running locally

```bash
./server.sh          # serves at http://localhost:8000/index.html
./server.sh 8080     # or pick a port
```

Any static file server works — it's just static files.

## Data model (Firestore)

| Collection                         | Purpose                                              |
|------------------------------------|------------------------------------------------------|
| `config/currentWeek`               | the active week; menu clears on rollover             |
| `config/adminAuth`                 | admin sign-in (plaintext, checked client-side)       |
| `employees`                        | roster (name + team)                                 |
| `menu/{date}`                      | that day's dish options                              |
| `orders/{date}/entries/{employee}` | each person's pick; kept indefinitely for the report |

> **Note:** This is a trust-based internal tool — Firestore rules are open and there's no real authentication. Don't put anything sensitive in it.
