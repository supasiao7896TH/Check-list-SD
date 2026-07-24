# HANDOFF — Firebase online-sync + PIN delete-protection

This document hands off a scoped-but-unimplemented project to whichever Claude Code
session (e.g. Claude in VS Code) picks up this repo next. It captures the codebase
research and decisions already made in a prior session so you don't need to
re-explore or re-ask the user the same questions.

**Do not skip straight to coding.** Read this whole file, then confirm the plan
with the user (especially the PIN — see "Things you must ask the user" below)
before touching code.

---

## 1. Project summary

Check-list-SD is a **static, framework-free PWA** — no React/Vue/Flutter, no
`package.json`, no bundler, no build step. It's a checklist app for tracking a
plant Shut-Down procedure's tasks/subtasks, deployed as-is via GitHub Pages
(`.nojekyll` present, no CI).

Top-level files:
- `index.html` — landing page (mobile vs. PC picker), registers the service worker.
- `interactive_checklist_sd_mobile.html` (~3,871 lines) — mobile/PWA version, single
  self-contained HTML file with inline `<style>`/`<script>`.
- `interactive_checklist_sd_app.html` (~2,627 lines) — desktop/PC version, also
  self-contained, **independently maintained** — not a shared codebase with the
  mobile file.
- `sw.js` — service worker (offline asset caching, cache name `sd-checklist-v2`).
- `manifest.webmanifest` — PWA manifest.
- External deps loaded via CDN `<script>` tags only: Tailwind CSS
  (`cdn.tailwindcss.com`), Chart.js (`cdn.jsdelivr.net`). No npm, no Firebase SDK,
  no backend of any kind currently exists.

**Key architectural fact: the mobile and desktop HTML files are two divergent
copies**, each with its own persistence engine (see §3). Any sync work touches
both files, or — per the decision below — a new `shared/` module set gets
imported by both.

## 2. Goal

Make the app online/synced: when someone updates a checklist item's progress on
one device, everyone else using the app should see that update too — **while
keeping the app fully usable offline**, syncing automatically on reconnect.

A secondary concern the user raised: with live sync, anyone could accidentally
(or maliciously) delete tasks/subtasks and it would propagate instantly to
everyone. Mitigation decided: a shared PIN gates destructive UI actions (see §4).

## 3. Codebase findings

### Data model
Plain JS array of task objects, seeded via `INITIAL_TASKS_JSON`
(`interactive_checklist_sd_mobile.html:1897`), mirrored in
`checklist_sd_backup_2025-10-18.json` (31 tasks). Shape:

```json
{
  "id": "task-1753833768060",
  "description": "Preparation before shut down empty TU-804",
  "datetime": "2025-10-19T08:30",
  "actualStartTime": null,
  "actualEndTime": null,
  "notes": "",
  "responsible": "",
  "textColor": "text-blue-600 dark:text-blue-400",
  "subtasks": [
    { "id": "sub-...-0", "text": "...", "checked": false, "textColor": "..." }
  ]
}
```

- Mobile version additionally normalizes each subtask with a `checkedAt`
  timestamp and each task with a `completed` boolean
  (`interactive_checklist_sd_mobile.html:2408-2421`). Desktop version does **not**
  have these fields — only relies on subtask `checked` +
  `actualStartTime`/`actualEndTime`.
- "Progress" is *derived*, not stored: `App.calculateProgress(task)`
  (mobile: `interactive_checklist_sd_mobile.html:2452`) counts checked subtasks.
  Desktop has an equivalent but not identical implementation.
- No separate "checklist" entity — one flat list of ~31 tasks with nested
  subtasks, no multi-document concept.

### Persistence (two completely different engines)

**Mobile** — IndexedDB via a custom promise wrapper:
```js
// interactive_checklist_sd_mobile.html:1938
const STORAGE_ENGINE = (() => {
    const DB_NAME = 'interactive_SD_DB_mobile';
    const STORE = 'appstore'; // keyPath 'k', value 'v' — generic KV store
    ...
    return { open, get(key), put(key, value), delete(key) };
})();
```
- `App.loadTasks()` (line 2401) reads the whole array via `STORAGE_ENGINE.get('tasks')`.
- `App.saveTasks()` (line 2432) does a **full-array overwrite**:
  `STORAGE_ENGINE.put('tasks', this.tasks)` — no per-item writes, no dirty-tracking.
- One-time migration path from old localStorage data (`migrateFromLocalStorage`, ~line 2172).
- A separate `CRYPTO_VAULT` (line 1991) encrypts the user's Gemini API key with
  AES-GCM, also stored via `STORAGE_ENGINE`.

**Desktop** — plain synchronous `localStorage`:
```js
// interactive_checklist_sd_app.html:1097
loadTasks() {
    const tasksJSON = localStorage.getItem(this.STORAGE_KEY);
    ...
},
saveTasks() {
    this.sortTasks();
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.tasks));
    this.checkCompletionStatus();
},
```
Desktop stores the Gemini API key in **plaintext** localStorage (no
CRYPTO_VAULT equivalent) — worth knowing, not necessarily part of this task's
scope.

Both versions support manual **Export/Import JSON**
(`handleExport`/`handleImport`, mobile lines ~2964/2975) — today this is the
*only* cross-device data-transfer mechanism.

### State management
No framework/library — a single global plain-object singleton `App` per file
(`interactive_checklist_sd_mobile.html:2029`, `interactive_checklist_sd_app.html:795`)
holds all state as plain properties. Rendering is manual/imperative: every state
mutation is followed by an explicit `this.render()` call (full re-render from
`this.tasks`). No pub/sub or diffing infra exists — adding realtime sync is
conceptually simple (call `render()` again on remote change) but there's nothing
to hook into beyond that.

### The single UI choke point
A delegated `change` event handler on the task list container:
```js
// interactive_checklist_sd_mobile.html:941
this.dom.taskListEl.addEventListener('change', this.handleSubtaskChange.bind(this));
```
`App.handleSubtaskChange(e)` (mobile: `interactive_checklist_sd_mobile.html:3046`;
desktop: `interactive_checklist_sd_app.html:1652`) is where a checkbox toggle:
1. Reads `taskId`/`subtaskId` (or `data-taskComplete`) off `data-*` attributes.
2. Mutates `subtask.checked` (and task-level completion fields) in `this.tasks`.
3. Calls `this.saveTasks()` then `this.render()`.

**This is the single hook point** for wiring in outbound sync in each file — plus
the task-level complete/clear-all/reset-data handlers for the PIN gate (§4).

### Identity / auth
**None exists.** No `username`, `device id`, `login`, `auth`, `currentUser`
concept anywhere. The only per-task "who" field is `responsible` — a free-text
string, always `""` in seed data, not tied to any identity. A user/device
identity concept has to be built from scratch.

### CSP (must be widened for Firebase)
```html
<!-- interactive_checklist_sd_mobile.html:3 (desktop has an equivalent tag) -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob: https://i.postimg.cc;
  connect-src 'self' https://generativelanguage.googleapis.com;
  base-uri 'self'; form-action 'self'">
```
Currently only allows network calls to Google's Gemini API. Needs, in **both**
HTML files:
- `script-src`: add `https://www.gstatic.com` (Firebase modular SDK via CDN
  ES-module import — no bundler needed, matches this project's no-build style).
- `connect-src`: add `https://firestore.googleapis.com https://*.firebaseio.com
  https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`
  (Firestore + Anonymous Auth endpoints), keep the existing Gemini origin.

### Existing docs
Only `README.md` (Thai) exists — no `CLAUDE.md`/`AGENTS.md`/`context.md` yet.
It documents the file structure and basic usage; nothing about architecture or
contributor rules. **Writing `context.md` and `agents.md` is the last step of
this project**, once the sync implementation is verified working (§7).

### No existing backend/cloud integration
No Firebase/Supabase/any BaaS SDK anywhere. The only external integration is the
Gemini API (user-supplied key, client-side encrypted on mobile only). This will
be a from-scratch Firebase integration.

---

## 4. Decisions already made by the user (do not re-ask these)

- **Backend: Firebase** — Firestore (database) + Firebase Anonymous Auth (identity).
- **No real login.** Just a one-time "enter your name" prompt on first launch,
  paired with a Firebase anonymous-auth UID for attribution
  (`lastEditedBy: {uid, name}`).
- **No real Firebase project exists yet.** Implement everything against a
  clearly-marked **placeholder config** in `shared/firebase-config.js` (e.g.
  `apiKey: "REPLACE_WITH_REAL_FIREBASE_CONFIG"`), designed to be a drop-in swap
  once the user creates the project in the Firebase console and hands over real
  config values. Do not block implementation on having real credentials.
- **Code sharing approach:** extract shared logic (data model helpers, identity,
  sync engine, PIN gate) into a `shared/` directory of plain JS files, imported
  via `<script>` by both HTML files. **Do not** merge the two UIs into one
  file — mobile and desktop keep their own layouts/rendering code.
- **Offline-first must be preserved.** Use Firestore's built-in offline
  persistence (IndexedDB-backed cache, automatic queue-and-flush on reconnect)
  rather than building a custom offline queue.
- **Delete protection: single shared PIN**, enforced **client-side / UI-level
  only** — explicitly **not** enforced via Firestore security rules. Multiple
  devices unlock independently by each entering the same PIN locally (no
  server-side unlock state). Only the PIN's **SHA-256 hash** is ever stored or
  committed to the repo — **never the plaintext**.
- **After the sync implementation is verified working end-to-end** (see §7),
  write `context.md` (architecture doc) and `agents.md` (rules for future AI
  agents working on this repo), commit, and push to `main`.

## Things you must ask the user (do not skip)

- **The PIN value.** The user already gave this to a prior session in chat, but
  it was deliberately **not** written into this file or any repo file — do not
  guess it or invent one. Ask the user directly for the PIN they want to use,
  then compute its SHA-256 hash (e.g. via `crypto.subtle.digest`) and bake only
  the hash into `shared/pin-gate.js`. Never log, echo back, or commit the
  plaintext PIN anywhere.
- **Real Firebase config**, once the user has created the project in the
  Firebase console (Firestore enabled, Anonymous Auth enabled) — needed to swap
  into `shared/firebase-config.js` before live cross-device testing (Phase 6).

---

## 5. Architecture

```
Check-list-SD/
  shared/
    firebase-config.js    # placeholder Firebase config, clearly marked for swap-in
    app-core.js            # task/subtask data model helpers, calculateProgress()
                            # (deduped from both HTML files — see mobile lines 2408-2452)
    identity.js             # deviceId + display-name prompt, Firebase anonymous sign-in
    sync-engine.js           # Firestore wiring: outbound per-task writes, onSnapshot
                              # inbound listener, offline persistence init, presence heartbeat
    pin-gate.js               # SHA-256 hash compare, unlock-state storage,
                                # gate() helper wrapping destructive actions
  firestore.rules            # security rules draft — user pastes into Firebase console
  interactive_checklist_sd_mobile.html   # UI unchanged; add <script src="shared/*.js">
  interactive_checklist_sd_app.html      # UI unchanged; add <script src="shared/*.js">
```

Both HTML files keep their existing UI/rendering code. `App.tasks` /
`App.saveTasks()` / `App.handleSubtaskChange()` in each file call into
`shared/sync-engine.js` instead of duplicating Firestore logic.

**Firestore data model:**
- `tasks/{taskId}` — one document per task (matches the existing task JSON
  shape), plus `updatedAt` (server timestamp, for last-write-wins merge) and
  `lastEditedBy: {uid, name}`.
- `presence/{uid}` — optional lightweight presence doc `{name, lastSeen}`,
  updated via heartbeat + `onDisconnect()`.

**Firestore security rules (draft intent):** require `request.auth != null`
(any signed-in anonymous user) for read/write on `tasks/*` and `presence/*`. No
PIN check server-side — deletion protection is UI-only, per the user's decision.

---

## 6. Phased implementation plan

- [ ] **Phase 1 — Extract shared code.** Create the `shared/` files above. Move
      `calculateProgress()` and task/subtask normalization (the `checkedAt`/
      `completed` logic currently mobile-only, `interactive_checklist_sd_mobile.html:2408-2452`)
      into `shared/app-core.js` so both versions compute progress identically.
      Update both HTML files' CSP meta tags (§3) and add `<script>` includes.
      `firebase-config.js` ships with an obvious placeholder object and a
      comment marking exactly what gets pasted in later.

- [ ] **Phase 2 — Identity.** `shared/identity.js`: on first load, if no name is
      stored locally, show a lightweight modal asking for a display name
      (localStorage, works fully offline). Independently, kick off
      `signInAnonymously()` when online for a stable `uid`. Auth
      failure/offline must never block using the app.

- [ ] **Phase 3 — Outbound sync.** Hook `sync-engine.js` into
      `App.handleSubtaskChange` (mobile line ~3046, desktop line ~1652) and the
      task-level complete/clear/reset handlers. In addition to the existing
      local save, write the single changed task as `tasks/{taskId}` via
      `setDoc(..., {merge:true})` with a server timestamp. Firestore's SDK
      queues writes automatically while offline and flushes on reconnect.

- [ ] **Phase 4 — Inbound sync.** Add an `onSnapshot` listener on the `tasks`
      collection. On remote changes, merge into `App.tasks` by task id
      (last-write-wins via `updatedAt`), skip re-processing this device's own
      pending writes (avoid flicker/loops), call the existing `App.render()`.
      Prefer Firestore data over local seed once the first snapshot arrives;
      local storage remains the fast first-paint + offline fallback.

- [x] **Phase 5a — PIN gate ("Edit mode" toggle).** `shared/pin-gate.js`
      built: SHA-256 hash constant (PIN asked directly from the user
      in-session, never committed in plaintext), `verifyPin()` only — no
      state lives in this module. State lives in `settings.adminUnlocked`
      (persisted via each file's own `loadSettings()`/`saveSettings()`,
      default `false`). Mirrors the sibling Check-list-SU app's design
      exactly (verified against SU's actual source, not a paraphrase) so the
      same pattern can be copied to future apps:
      - `App.isEditingAllowed()` — single central check, `!!this.settings.adminUnlocked`.
      - A dedicated PIN modal (`pinModal`/`pinInput`/`pinSubmitBtn`/`pinCancelBtn`,
        separate from the generic `openConfirmModal`), opened via
        `handleEditModeToggle()` when locked; the same toggle button
        (`editModeBtn`/`editModeLabel`) locks immediately with no PIN when
        clicked while unlocked.
      - `updateEditModeUI()` runs at the end of every `render()`, syncing the
        toggle label and hiding the toolbar add/clear/reset/import buttons
        when locked.
      - Every mutating entry point is gated: `openEditModal` (covers both
        add-new-task and per-task edit), `handleEditFormSubmit`, `handleImport`,
        the delete branch of `handleTaskListClick`, `handleSubtaskChange`
        (reverts the checkbox if a disabled one is bypassed),
        `handleClearAllChecks`, `handleResetData` — ~7 choke points per file.
      - Per-task edit/delete buttons are hidden and checkboxes `disabled` at
        render time when locked, not just blocked at click-time.
      - `loadSettings()` grandfathers in devices that were already active
        (have a stored identity name) before this feature shipped, so nobody
        already using the app gets suddenly locked out.
      Desktop bridges `verifyPin` onto `window.__SD_PIN__`; mobile imports
      `shared/pin-gate.js` directly as an ES module — SD's own established
      module convention, unlike SU which loads its PIN logic via a classic
      (non-module) `<script src="shared/app-core.js">`. `firestore.rules`
      (auth-required, no PIN logic server-side) already existed pre-Phase-5
      and needed no changes.
      **Superseded design note:** an earlier version of this session scoped
      the gate narrowly (only delete/clear/reset/import, prompting only at
      click-time) — that was replaced with the above full-scope design per
      explicit user correction, to match Check-list-SU exactly.
- [ ] **Phase 5b — Presence.** Lightweight presence writes/heartbeat
      (`presence/{uid}` doc, `onDisconnect()`) — still outstanding, not part
      of the PIN-gate work above.

- [ ] **Phase 6 — Testing (blocked on real Firebase project).** Everything above
      can be built and verified locally against the placeholder config (module
      loads, PIN hash compare, offline-queue logic), but live cross-device sync
      needs the user's real Firebase project. Once they create it, enable
      Firestore + Anonymous Auth, and send real config:
      1. Swap `shared/firebase-config.js` placeholder values for real ones.
      2. User pastes `firestore.rules` into the console and publishes.
      3. Verify in-browser: two tabs, toggle a subtask in one, confirm live
         update in the other; simulate offline (devtools throttling), make
         changes, go back online, confirm sync; confirm PIN gate blocks/unblocks
         delete actions per device.

## 7. Documentation (final step, after Phase 6 verification)

Write `context.md` (architecture: `shared/` modules, Firestore data model,
identity model, CSP entries, PIN-gate design) and `agents.md` (rules for future
AI agents: keep mobile/desktop parity via `shared/`, never commit a real PIN or
Firebase service-account secret, preserve offline-first behavior, note that the
Firestore *publishable* client config is fine to expose but must stay
swappable). Commit and push to `main`.

---

## Open dependencies / blockers

- Real Firebase project + config and `firestore.rules` publish are pending on
  the user (Phase 6, steps 1-2).
- The PIN value is pending — ask the user directly in your session, do not
  reuse or guess a value.
