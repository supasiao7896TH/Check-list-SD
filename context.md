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
| `sw.js` | service worker, cache name `sd-checklist-v2`, cache app shell + `shared/*.js` |
| `manifest.webmanifest` | PWA manifest |
| `checklist_sd_backup_2025-10-18.json` | ข้อมูลสำรอง/seed ของ 31 task ชุด Shut-Down จริง |
| `HANDOFF.md` | เอกสารส่งต่องานโปรเจกต์ Firebase sync + PIN protection (ประวัติ/แผน/สถานะละเอียด) |

## Mobile vs Desktop: ตั้งใจแยกกัน ไม่ merge

ทั้งสองไฟล์ HTML เป็น **คนละชุดโค้ดที่ดูแลแยกกันโดยเจตนา** ไม่ใช่โค้ดชุดเดียวกัน:

- **Mobile** เก็บข้อมูลด้วย **IndexedDB** ผ่าน wrapper เอง (`STORAGE_ENGINE`, DB name
  `interactive_SD_DB_mobile`) และมี `CRYPTO_VAULT` เข้ารหัส Gemini API key ด้วย AES-GCM
- **Desktop** เก็บข้อมูลด้วย **`localStorage`** ธรรมดา และเก็บ Gemini API key เป็น **plaintext**
  (ไม่มี vault เทียบเท่า)
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
| `shared/firebase-config.js` | placeholder Firebase config object + `getFirebaseApp()` (lazy-load + memoize Firebase App singleton ผ่าน dynamic `import()` จาก CDN) + `isPlaceholderConfig()` guard |
| `shared/identity.js` | UID ของเครื่อง (`local-...`, เก็บใน `localStorage`) + ชื่อที่ผู้ใช้กรอก + `signInAnon()` (sign-in แบบ anonymous ผ่าน Firebase Auth, **ไม่ throw เด็ดขาด** — ล้มก็ยังใช้ local UID ต่อได้) |
| `shared/sync-engine.js` | `createSyncEngine({getLocalTasks, onRemoteChange, getIdentity, collectionName})` คืนค่า `{ push(tasks) }` — ผูก Firestore `onSnapshot` (inbound, merge last-write-wins) เข้ากับ diffed batch write (outbound, เขียนเฉพาะ task ที่เปลี่ยน + ลบ task ที่หายไป), เปิด offline persistence ผ่าน `enableIndexedDbPersistence` |

โมดูลเหล่านี้ไม่แตะ DOM หรือ `App` object โดยตรง — สื่อสารผ่าน callback ที่รับเข้ามาเท่านั้น
เพื่อให้ทั้งสอง HTML file เรียกใช้แบบเดียวกันได้โดยไม่ต้องรู้จักกัน

## Firestore data model ปัจจุบัน

- Collection `tasks/{taskId}` — หนึ่ง document ต่อหนึ่ง task (โครงสร้างเดียวกับ task object
  ด้านบน) บวกฟิลด์ `updatedAt` (server timestamp, ใช้ตัดสิน last-write-wins) และ
  `lastEditedBy: {uid, name}`
- `firestore.rules` ปัจจุบันมีแค่กฎเดียว: `allow read, write: if request.auth != null;`
  บน `tasks/{taskId}` — **ต้อง sign-in (แม้จะเป็น anonymous) เท่านั้น ไม่มี PIN logic ฝั่ง server**
  (ตั้งใจให้ PIN เป็นแค่ UI-level gate ฝั่ง client)

## Content-Security-Policy

CSP meta tag ต้อง**เหมือนกันทุกตัวอักษร**ในทั้งสองไฟล์ HTML (ตรวจสอบแล้วว่าตรงกันตอนเขียนเอกสารนี้)
ปัจจุบันเปิด origin ไว้ดังนี้:

- `script-src`: `cdn.tailwindcss.com`, `cdn.jsdelivr.net` (Chart.js), `www.gstatic.com`
  (Firebase modular SDK โหลดผ่าน dynamic `import()`, ไม่มี bundler)
- `connect-src`: `generativelanguage.googleapis.com` (Gemini API), `firestore.googleapis.com`,
  `firebaseinstallations.googleapis.com`, `identitytoolkit.googleapis.com`,
  `securetoken.googleapis.com` (Firestore + Anonymous Auth)

ถ้าเพิ่ม external origin ใหม่ ต้องแก้ทั้งสองไฟล์พร้อมกัน (ดู [`agents.md`](./agents.md))

## สถานะปัจจุบัน / งานที่ยังค้าง

โปรเจกต์ Firebase sync (รายละเอียดเต็มใน `HANDOFF.md`) แบ่งเป็น 6 phase — **Phase 1–4 เสร็จแล้ว**
(แยก `shared/` module, identity, sync ขาออก, sync ขาเข้า) ส่วนที่ยังไม่ทำ:

- **Phase 5 — PIN gate + presence**: ยังไม่มีโค้ด PIN gate ในรีโปนี้เลย (`shared/pin-gate.js`
  ยังไม่ถูกสร้าง) ไม่มี presence document/heartbeat การลบ/เคลียร์ข้อมูลยังไม่มีการ gate ใดๆ
- **Phase 6 — Live testing กับ Firebase project จริง**: `shared/firebase-config.js` ใส่ config
  จริงของโปรเจกต์ `t-dispatcher-465104-r2` แล้ว (คอมมิต `a736f54`) แต่พบว่า `sw.js` cache ไฟล์
  `shared/*.js` แบบ cache-first ค้างตลอดไปและไม่เคย bump cache version ทำให้เครื่องที่เคยติดตั้ง
  แอปไปแล้ว (ตอน config ยังเป็น placeholder) ไม่เห็น config ใหม่ — sync จึงยัง fail แบบเงียบ ๆ
  (แก้แล้ว: bump `CACHE` เป็น `sd-checklist-v3` และเปลี่ยน `shared/*.js` เป็น network-first ใน
  `sw.js`) ยังต้องตรวจสอบด้วยตัวเองว่า publish `firestore.rules` เข้า console และเปิด
  Anonymous Auth ในโปรเจกต์จริงแล้วหรือยัง

ก่อนเริ่มงานที่เกี่ยวกับ sync/auth/PIN ให้อ่าน `HANDOFF.md` §4–§7 เพื่อดูการตัดสินใจที่มีอยู่แล้ว
(เช่น ห้าม hardcode PIN plaintext, ต้องถามผู้ใช้เรื่อง PIN และ Firebase config จริงเอง)
