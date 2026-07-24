# context.md — Check-list-SD

เอกสารนี้อธิบายสถาปัตยกรรมปัจจุบันของโปรเจกต์ Check-list-SD สำหรับใครก็ตาม (คนหรือ AI agent)
ที่จะมาทำงานต่อในรีโปนี้ ดูกฎการทำงาน/ข้อห้ามใน [`agents.md`](./agents.md) และดูประวัติ/แผนงาน
โปรเจกต์ Firebase sync แบบละเอียดใน [`HANDOFF.md`](./HANDOFF.md)

## ภาพรวม

Check-list-SD เป็นเว็บแอปเช็คลิสต์สำหรับติดตามขั้นตอน **Shut-Down** ของหน่วย PTA
เป็น **static PWA ล้วนๆ ไม่มี framework** (ไม่ใช้ React/Vue), **ไม่มี build step**
(ไม่มี `package.json`, ไม่มี bundler, ไม่มี npm) — deploy ตรงๆ ผ่าน GitHub Pages
(มีไฟล์ `.nojekyll`, ไม่มี CI) โปรเจกต์นี้มี sibling ชื่อ "Check-list-SU" ที่ใช้โครงสร้างเดียวกัน

รันแอปโดยเปิด `index.html` ตรงๆ ในเบราว์เซอร์ (หรือ serve โฟลเดอร์ด้วย static file server
อะไรก็ได้) — ไม่มี automated test ในรีโปนี้ การ verify ทำด้วยมือในเบราว์เซอร์

## โครงสร้างไฟล์

| ไฟล์/โฟลเดอร์ | หน้าที่ |
|---|---|
| `index.html` | หน้า landing เลือกเปิดเวอร์ชันมือถือหรือ PC, ลงทะเบียน service worker |
| `interactive_checklist_sd_mobile.html` | เวอร์ชันมือถือ/PWA (~3,900 บรรทัด) — self-contained HTML+JS |
| `interactive_checklist_sd_app.html` | เวอร์ชัน PC/desktop (~2,700 บรรทัด) — self-contained HTML+JS |
| `shared/` | ES module ที่ทั้งสองเวอร์ชัน import ร่วมกัน (ดูรายละเอียดด้านล่าง) |
| `firestore.rules` | security rules ของ Firestore (paste เข้า Firebase console เอง) |
| `sw.js` | service worker, cache name `sd-checklist-v4` — app shell + navigate เป็น network-first, `shared/*.js` เป็น network-first (กัน config ค้าง cache), CDN/asset อื่นเป็น cache-first แต่เฉพาะ response `res.ok` และไม่ใช่ opaque เท่านั้น (กัน cache-poisoning), กรอง scheme ที่ไม่ใช่ http(s) ทิ้งก่อนแตะ Cache API |
| `manifest.webmanifest` | PWA manifest |
| `checklist_sd_backup_2025-10-18.json` | ข้อมูลสำรอง/seed ของ 31 task ชุด Shut-Down จริง |
| `HANDOFF.md` | เอกสารส่งต่องานโปรเจกต์ Firebase sync + PIN protection (ประวัติ/แผน/สถานะละเอียด) |

## Mobile vs Desktop: ตั้งใจแยกกัน ไม่ merge

ทั้งสองไฟล์ HTML เป็น **คนละชุดโค้ดที่ดูแลแยกกันโดยเจตนา** ไม่ใช่โค้ดชุดเดียวกัน:

- **Mobile** เก็บ task ข้อมูลด้วย **IndexedDB** ผ่าน wrapper เอง (`STORAGE_ENGINE`, DB name
  `interactive_SD_DB_mobile`) และมี `CRYPTO_VAULT` เข้ารหัส Gemini API key ด้วย AES-GCM
- **Desktop** เก็บ task ข้อมูลด้วย **`localStorage`** ธรรมดา แต่ Gemini API key ใช้
  `CRYPTO_VAULT`/`STORAGE_ENGINE` แบบเดียวกับ mobile แล้ว (DB name แยกกัน
  `interactive_SD_DB_desktop`) — เดิมเก็บเป็น plaintext ใน `localStorage`, แก้แล้วพร้อม migrate
  key เก่าอัตโนมัติตอนโหลดแอปครั้งแรกหลังอัปเดต (ดู `loadApiKey()` ใน `interactive_checklist_sd_app.html`)
- ทั้งสองไฟล์มี global singleton `App` object ของตัวเอง จัดการ state แบบ imperative
  (mutate แล้วเรียก `this.render()` เอง ไม่มี virtual DOM/diffing)
- มีแค่ logic ที่ cross-cutting จริงๆ (data normalization, identity, sync) เท่านั้นที่ถูกแยกไปอยู่ใน `shared/`

## Data model

Task object shape (ใช้เหมือนกันทั้งสองเวอร์ชัน export/import JSON ข้ามกันได้):

```json
{
  "id": "task-1753833768060",
  "description": "...",
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

- Mobile เพิ่มฟิลด์ `checkedAt` (subtask) และ `completed` (task) ที่ desktop ไม่มี
- "Progress" เป็นค่าที่คำนวณสด (`calculateProgress`) ไม่ได้เก็บลง storage — mobile กับ desktop
  คำนวณคนละอัลกอริทึมโดยเจตนา (ดูคอมเมนต์ใน `shared/app-core.js`) จึงไม่ได้ย้าย
  `calculateProgress()` เข้า `shared/`

## `shared/` modules

โมดูลทั้งหมดเป็น ES module จริง (`export`/`import`) โหลดผ่าน `<script type="module">`
ตรงๆ ในเบราว์เซอร์ ไม่มี bundler — ทั้งสองไฟล์ HTML import ด้วย relative path `./shared/*.js`

| ไฟล์ | หน้าที่ |
|---|---|
| `shared/app-core.js` | `normalizeTask`/`normalizeSubtask` (เติมฟิลด์ที่หาย), `mergeTaskLastWriteWins(local, remote)` — merge แบบ last-write-wins โดยเทียบ `updatedAt` |
| `shared/firebase-config.js` | Firebase config จริงของโปรเจกต์ `t-dispatcher-465104-r2` (ไม่ใช่ placeholder แล้ว ตั้งแต่คอมมิต `a736f54`) + `getFirebaseApp()` (lazy-load + memoize Firebase App singleton ผ่าน dynamic `import()` จาก CDN) + `isPlaceholderConfig()` guard (เหลือไว้เผื่อ config ถูกรีเซ็ตกลับเป็น placeholder ในอนาคต) |
| `shared/identity.js` | UID ของเครื่อง (`local-...`, เก็บใน `localStorage`) + ชื่อที่ผู้ใช้กรอก + `signInAnon()` (sign-in แบบ anonymous ผ่าน Firebase Auth, **ไม่ throw เด็ดขาด** — ล้มก็ยังใช้ local UID ต่อได้) |
| `shared/sync-engine.js` | `createSyncEngine({getLocalTasks, onRemoteChange, getIdentity, collectionName})` คืนค่า `{ push(tasks) }` — ผูก Firestore `onSnapshot` (inbound, merge last-write-wins) เข้ากับ diffed batch write (outbound, เขียนเฉพาะ task ที่เปลี่ยน + ลบ task ที่หายไป), เปิด offline persistence ผ่าน `enableIndexedDbPersistence` |

โมดูลเหล่านี้ไม่แตะ DOM หรือ `App` object โดยตรง — สื่อสารผ่าน callback ที่รับเข้ามาเท่านั้น
เพื่อให้ทั้งสอง HTML file เรียกใช้แบบเดียวกันได้โดยไม่ต้องรู้จักกัน

## Firestore data model ปัจจุบัน

- Collection `tasks/{taskId}` — หนึ่ง document ต่อหนึ่ง task (โครงสร้างเดียวกับ task object
  ด้านบน) บวกฟิลด์ `updatedAt` (server timestamp, ใช้ตัดสิน last-write-wins) และ
  `lastEditedBy: {uid, name}`
- `firestore.rules` อนุญาต `read`/`delete` แค่เงื่อนไข sign-in (แม้จะเป็น anonymous) แต่
  `create`/`update` ต้องผ่าน `validTask()` เพิ่มเติม: จำกัดเฉพาะ field ที่รู้จัก, จำกัดความยาว
  string แต่ละ field (`description` ≤500, `notes` ≤2000, `responsible` ≤200,
  `lastEditedBy.name` ≤60), และบังคับ `textColor` ให้ match regex
  `^[a-zA-Z0-9:/ _-]*$` เท่านั้น (กัน attribute-breakout payload ที่ฝั่ง client render เป็น
  HTML attribute) — เป็น defense-in-depth เสริมจาก client-side sanitize ไม่ใช่ตัวแทน
  **ไม่มี PIN logic หรือ per-user ownership ฝั่ง server** (ตั้งใจ — PIN gate ที่ implement แล้ว
  ใน `shared/pin-gate.js` เป็นแค่ UI-level เท่านั้น client ที่เรียก Firestore SDK ตรงๆ
  bypass การเช็ค PIN นี้ได้เสมอ) — ไฟล์นี้เป็นแค่ draft ต้อง publish เข้า Firebase Console เอง
  ทุกครั้งที่แก้

## Content-Security-Policy

CSP meta tag ต้อง**เหมือนกันทุกตัวอักษร**ในทั้งสองไฟล์ HTML (ตรวจสอบแล้วว่าตรงกันตอนเขียนเอกสารนี้)
ปัจจุบันเปิด origin ไว้ดังนี้:

- `script-src`: `cdn.tailwindcss.com`, `cdn.jsdelivr.net` (Chart.js), `www.gstatic.com`
  (Firebase modular SDK โหลดผ่าน dynamic `import()`, ไม่มี bundler)
- `connect-src`: `generativelanguage.googleapis.com` (Gemini API), `firestore.googleapis.com`,
  `firebaseinstallations.googleapis.com`, `identitytoolkit.googleapis.com`,
  `securetoken.googleapis.com` (Firestore + Anonymous Auth)

ถ้าเพิ่ม external origin ใหม่ ต้องแก้ทั้งสองไฟล์พร้อมกัน (ดู [`agents.md`](./agents.md))

**Known limitation:** `script-src` มีทั้ง `'unsafe-inline'` และ `'unsafe-eval'` (จำเป็นสำหรับ
Tailwind CDN + Chart.js + inline `<script>` เพราะไม่มี build step) — CSP จึงแทบไม่ช่วยกัน XSS
ได้จริง ชั้นป้องกันหลักคือการ sanitize/escape ฝั่ง client (ดูหัวข้อ "การป้องกัน XSS" ด้านล่าง)

## การป้องกัน XSS ในข้อมูลที่ sync มาจากเครื่องอื่น

ข้อมูล task (`textColor`, `id`, `description`, `notes`, `responsible`, `subtask.text`) มาจาก
Firestore ได้ทุกเมื่อผ่าน `onSnapshot` — เท่ากับมาจาก**เครื่องอื่นที่ไม่น่าเชื่อถือ**เสมอ (ใครก็ได้
ที่ sign-in anonymous เขียนเข้า Firestore ได้ ดูหัวข้อ Firestore data model) กฎตอน render:

- **Text content** (`description`, `notes`, `responsible`, `subtask.text`): ต้องผ่าน
  `this.escapeHTML(...)` เสมอก่อนใส่ใน template string — mobile กับ desktop มี `escapeHTML`
  คนละ implementation (mobile ใช้ `createTextNode` จึง **ไม่** escape เครื่องหมายคำพูด,
  desktop escape ครบรวมถึง `"`/`'`) แต่ทั้งคู่ปลอดภัยสำหรับใส่เป็น text content
- **ค่าที่ใส่เข้า HTML attribute** (`class="${...}"`, `id="${...}"`, `data-*="${...}"`,
  `for="${...}"`): **ห้าม** interpolate ดิบเด็ดขาด เพราะ `escapeHTML` แบบ mobile ไม่ escape `"`
  พอที่จะกัน attribute-breakout ได้ — ให้ใช้:
  - `this.safeColorClass(value, fallback)` สำหรับ `textColor` — allowlist เฉพาะอักขระ CSS class
    (`^[-a-zA-Z0-9:/ _]+$`) ถ้าไม่ตรงคืนค่า fallback แทน (มีทั้งสองไฟล์ ใกล้ๆ `escapeHTML`)
  - `this.escapeHTML(...)` (desktop) หรือ `this.escapeAttr(...)` (mobile — ตัวใหม่ที่ escape
    `"`/`'` ที่ `escapeHTML` ของ mobile ไม่ทำ) สำหรับ `id`/`taskId`/`subtask.id` ที่ใส่ใน
    attribute เช่น `id=`, `data-task-id=`, `data-subtask-id=`, `for=`
- ข้อมูลที่มาจาก remote sync (`__SD_APPLY_REMOTE__` ใน desktop, `onRemoteChange` ใน mobile)
  ต้องผ่านเส้นทาง render เดียวกับข้อมูล local เสมอ — desktop เรียก `_sanitizeTasks()` ก่อน
  assign ใน `__SD_APPLY_REMOTE__` ด้วย (ไม่ข้ามเหมือนเดิม)
- ถ้าเพิ่มฟิลด์ใหม่ที่ sync ผ่าน Firestore แล้วต้อง render เป็น attribute ต้องใช้ helper
  ข้างต้นเสมอ ไม่ใช่แค่ `escapeHTML`

## สถานะปัจจุบัน / งานที่ยังค้าง

โปรเจกต์ Firebase sync (รายละเอียดเต็มใน `HANDOFF.md`) แบ่งเป็น 6 phase — **Phase 1–6 เสร็จแล้ว
และยืนยันแล้วว่า realtime sync ทำงานจริงข้ามอุปกรณ์** (ทดสอบ mobile ↔ desktop สำเร็จ):

- **Phase 5a — PIN gate**: เสร็จแล้ว `shared/pin-gate.js` (SHA-256 hash compare,
  `isUnlocked()`/`unlock()`/`lock()` ผูกกับ `localStorage` key `sd_pin_gate_unlocked`, ไม่มี
  server round-trip) ผูกผ่าน `App.runWithPinGate()` หน้าตัว handler ลบ task / ล้างสถานะทั้งหมด /
  รีเซ็ตข้อมูล / นำเข้าข้อมูล ทั้งสองไฟล์ — ขอบเขตแคบกว่าที่ `HANDOFF.md` §5 ร่างไว้ตอนแรก:
  การติ๊กเช็คลิสต์และเพิ่ม/แก้ task ยังไม่ต้องปลดล็อก (ตั้งใจ ไม่ให้กระทบการใช้งานปกติ) ปุ่ม
  "ล็อก PIN" ใหม่ในทั้งสองไฟล์ใช้ล็อกกลับด้วยตนเอง
- **Phase 5b — Presence**: ยังไม่มี presence document/heartbeat — ยังเป็น TODO ค้างอยู่
  (แยกจาก PIN gate ด้านบน)
- **Phase 6 — Live testing กับ Firebase project จริง**: เสร็จแล้ว `shared/firebase-config.js`
  ใส่ config จริงของโปรเจกต์ `t-dispatcher-465104-r2` (คอมมิต `a736f54`), แก้บั๊ก `sw.js` cache
  ค้าง config เก่า (bump เป็น `sd-checklist-v4`, `shared/*.js` เป็น network-first), และผู้ใช้
  ยืนยันแล้วว่า Anonymous Auth เปิดอยู่ + Firestore rules publish แล้ว + sync ทำงานจริงระหว่าง
  มือถือกับ PC

**Security hardening (ตรวจสอบเพิ่มเติมหลัง Phase 6):** พบและแก้แล้ว — stored-XSS ผ่าน
`textColor`/`id` attribute (ดูหัวข้อด้านบน), Firestore rules เปิดกว้างเกินไปไม่มี validation
(เพิ่ม `validTask()` แล้ว), desktop เก็บ Gemini API key เป็น plaintext (ย้ายไป `CRYPTO_VAULT`
แล้ว), service worker ไม่กรอง scheme/ไม่เช็ค `res.ok` ก่อน cache (แก้แล้ว), ชื่อผู้ใช้ไม่จำกัด
ความยาว (จำกัด 60 ตัวอักษรแล้ว) — รายละเอียดเชิง threat model อยู่ในหัวข้อที่เกี่ยวข้องด้านบน
ของไฟล์นี้ ไม่มีเอกสารแยกต่างหาก

ก่อนเริ่มงานที่เกี่ยวกับ sync/auth/PIN ให้อ่าน `HANDOFF.md` §4–§7 เพื่อดูการตัดสินใจที่มีอยู่แล้ว
(เช่น ห้าม hardcode PIN plaintext, ต้องถามผู้ใช้เรื่อง PIN เอง) — ข้อมูลเรื่อง Firebase config
ใน `HANDOFF.md` อาจเป็นเวอร์ชันเก่าที่ยังพูดถึง placeholder ให้ยึด `context.md` นี้เป็นหลักแทน
