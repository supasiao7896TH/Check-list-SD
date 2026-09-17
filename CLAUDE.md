# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Check-list-SD is a static PWA checklist app for tracking **Shut-Down** procedure steps for a PTA
(petrochemical) production unit. No framework (no React/Vue), no build step, no `package.json`,
no bundler, no automated tests. It has a sibling project "Check-list-SU" that shares the same
architecture (mobile/desktop split, `shared/` module pattern, PIN gate) — when porting patterns,
copy from *this* repo's actual source, not from memory of SU or old git history, since SD has
intentionally diverged from SU in one place (see Edit mode gate below).

Read [`agents.md`](./agents.md) first for hard rules/prohibitions, then
[`context.md`](./context.md) for architecture detail. `context.md` is the authoritative,
up-to-date doc; [`HANDOFF.md`](./HANDOFF.md) is a detailed historical planning doc for the
Firebase sync build-out (phases 1–6, all complete) and may contain stale info (e.g. it still
references placeholder Firebase config in places) — trust `context.md` over it when they conflict.

## Running / testing

There is no build, lint, or test command — this is intentional (see agents.md rule 1: do not add
a build step without being asked). To work on it:

- Open `index.html` directly in a browser, or serve the folder with any static file server.
- Deployed via **Cloudflare Pages**, auto-deploying on push to `origin/main` (older commits
  reference GitHub Pages / `.nojekyll` — the project has since moved to Cloudflare Pages).
- **No automated tests exist.** Verify changes by hand in the browser: open `index.html` in two
  tabs/devices, check a subtask in one and confirm it syncs to the other via Firestore; test
  offline behavior with DevTools network throttling then confirm the write queue flushes on
  reconnect; if you touch any code path that renders Firestore-sourced data into an HTML
  attribute, test it with a payload like `x" onmouseover="alert(1)` to confirm it's still escaped.

## Architecture

### Two intentionally separate apps, one shared layer

- `interactive_checklist_sd_mobile.html` (~3,700 lines) — mobile/PWA version. Persists tasks via
  **IndexedDB** through its own wrapper (`STORAGE_ENGINE`, DB `interactive_SD_DB_mobile`). Main
  logic lives in a single `<script type="module">`.
- `interactive_checklist_sd_app.html` (~2,600 lines) — desktop/PC version. Persists tasks via plain
  **`localStorage`**. Main logic lives in a classic (non-module) `<script>`; a separate
  `<script type="module">` bridges `shared/` ES modules onto `window.__SD_*` for the classic
  script to call.
- Each file has its own global singleton `App` object doing imperative state management (mutate →
  call `this.render()`; no virtual DOM/diffing).
- **These are never merged.** Version-specific UI/features go in only that file. Only genuinely
  cross-cutting logic (data normalization, identity, sync) belongs in `shared/`, imported by both
  via relative ES module `import` — never copy-pasted into both files.
- `shared/` modules never touch the DOM or the `App` object directly; they communicate through
  callbacks passed in by the caller (e.g. `createSyncEngine({getLocalTasks, onRemoteChange, ...})`),
  so both HTML files can use the same module without knowing about each other.

| `shared/` file | Responsibility |
|---|---|
| `app-core.js` | `normalizeTask`/`normalizeSubtask`, `mergeTaskLastWriteWins(local, remote)` |
| `firebase-config.js` | Real Firebase config for project `t-dispatcher-465104-r2` (not a placeholder), `getFirebaseApp()` (lazy-loads Firebase SDK via dynamic CDN `import()`) |
| `identity.js` | Per-device UID (`local-...` in `localStorage`) + user-entered display name + `signInAnon()` (never throws — falls back to local-only on failure) |
| `sync-engine.js` | `createSyncEngine(...)` → `{ push(tasks) }`; binds Firestore `onSnapshot` (inbound merge, last-write-wins) to a diffed batch write (outbound); enables offline persistence |
| `checklist-seed-data.js` | Default 31-task Shut-Down checklist as `window.CHECKLIST_SEED_DATA_JSON` (a JSON string with placeholder dates `2025-10-19`/`2025-10-20`, swapped for today/tomorrow at runtime by each app's `getDefaultTasks()`). Both HTML files load this via a classic `<script src>` tag placed before their main script, so it's available as a global before either app's init code runs. **Edit only this file** — do not reintroduce a duplicated inline copy in either HTML file. |

### Data model

Task shape (identical across both versions, so JSON export/import works cross-version):

```json
{
  "id": "task-...", "description": "...", "datetime": "2025-10-19T08:30",
  "actualStartTime": null, "actualEndTime": null, "notes": "", "responsible": "",
  "textColor": "text-blue-600 dark:text-blue-400",
  "subtasks": [{ "id": "sub-...-0", "text": "...", "checked": false, "textColor": "..." }]
}
```

Mobile adds `checkedAt` (subtask) / `completed` (task) that desktop doesn't have. "Progress" is
always computed live (`calculateProgress`), never persisted — mobile and desktop deliberately use
different algorithms, which is why it wasn't moved into `shared/`.

Firestore mirrors this as collection `tasks/{taskId}`, one doc per task, plus server-timestamp
`updatedAt` (drives last-write-wins) and `lastEditedBy: {uid, name}`.

### Security model — read before touching sync, rendering, or Firestore rules

- **All Firestore-sourced data is untrusted.** Anonymous auth means any signed-in client can write
  to `tasks/{taskId}`. Every value that reaches an HTML **attribute** (`class=`, `id=`, `data-*=`,
  `for=`) must go through `safeColorClass()` (for `textColor`) or `escapeAttr()`/`escapeHTML()`
  (implementation differs per file — mobile's `escapeHTML` does *not* escape quotes, so mobile uses
  a separate `escapeAttr()` for attributes) — never interpolate raw. Text-content-only interpolation
  can use plain `escapeHTML()`. Remote-synced data must flow through the same sanitizing render path
  as local data (desktop's `__SD_APPLY_REMOTE__` calls `_sanitizeTasks()` before assigning).
- `firestore.rules` enforces field allowlisting, string length caps, and a class-name regex on
  task-level `textColor` — but **cannot validate subtask array contents** (Firestore Rules can't
  loop over arrays), so subtask-level sanitization is client-side only, not backstopped by rules.
  This is a known, accepted gap, not an oversight.
- CSP `<meta>` tag must stay byte-identical between the two HTML files. Adding a new external
  origin (script/connect/img/font/style) means editing both files.
- Secrets discipline: never commit a PIN as plaintext (only its SHA-256 hash, and only after
  the user gives it directly in-session); never commit a Firebase *service-account* credential.
  The client-side Firebase config in `shared/firebase-config.js` is a publishable key, not a
  secret, and is already the real project config — don't replace it without the user supplying a
  real value first.
- **No AI/Gemini integration.** It was fully removed 2026-09-16 by request (API cost/risk). Don't
  reintroduce a Gemini/AI API call without asking first, even as a convenient shortcut — use plain
  template strings instead (see `buildHandoverReport`/`buildShutdownReport` in both HTML files).

### Edit mode gate (PIN)

Both files implement a view-until-unlocked pattern matching sibling project Check-list-SU, with one
intentional deviation: `handleSubtaskChange` (ticking a subtask, or mobile's "task complete"
checkbox) is **exempt** from the PIN gate — checkboxes are never disabled and never gated, because
real-world use showed requiring PIN-unlock just to tick a checkbox mid-shift was too disruptive.
Every other mutating action (add/edit/delete task, clear-all, reset, import) is still gated via
`App.isEditingAllowed()` (`!!settings.adminUnlocked`), same as SU. `shared/pin-gate.js` only exposes
`verifyPin()` (SHA-256 compare); unlock state lives in each file's own persisted `settings`, not
shared across files or devices.

### Service worker (`sw.js`)

Cache name `sd-checklist-v4` (bump this whenever a shell file's content changes materially).
Strategy: navigate requests and anything under `/shared/` are **network-first** (so Firestore
config/logic and seed-data edits reach already-installed clients without a forced reinstall);
everything else (CDN assets, icons) is cache-first, but only caches `res.ok` non-opaque responses
to avoid cache-poisoning, and skips non-http(s) schemes before touching the Cache API.

## Naming conventions

- JS identifiers/functions: `camelCase`
- New files under `shared/`: `kebab-case.js`
- User-facing text (UI, README): Thai
- Code, comments, variable names: English
