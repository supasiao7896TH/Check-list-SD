# agents.md — กฎสำหรับ AI agent ที่ทำงานในรีโปนี้

อ่าน [`context.md`](./context.md) ก่อนเพื่อเข้าใจสถาปัตยกรรม และดู [`HANDOFF.md`](./HANDOFF.md)
ถ้างานเกี่ยวข้องกับ Firebase sync / identity / PIN gate (มีรายละเอียดการตัดสินใจที่ทำไว้แล้ว
และ TODO ที่ยังค้าง — Phase 5b presence ยังไม่ทำ; Phase 5a PIN gate กับ Phase 6 live testing
เสร็จแล้ว)

## กฎหลัก

1. **ห้ามเพิ่ม build step.** โปรเจกต์นี้ตั้งใจเป็น static-file app ไม่มี `package.json`,
   bundler, transpiler, หรือ test framework ใดๆ — อย่าเพิ่มโดยไม่มีคนขอ ถ้าจะเพิ่ม dependency
   ใหม่ ให้โหลดผ่าน CDN `<script>` หรือ ES module `import` เหมือนของเดิม

2. **Mobile กับ Desktop คือคนละไฟล์ที่ตั้งใจแยกกัน — ห้าม merge เป็นไฟล์เดียว.**
   `interactive_checklist_sd_mobile.html` เก็บ task ด้วย IndexedDB (`STORAGE_ENGINE`) กับ
   `interactive_checklist_sd_app.html` เก็บ task ด้วย `localStorage` มี persistence engine,
   layout, และ state ของตัวเองแยกกัน (ทั้งสองไฟล์มี `STORAGE_ENGINE`/`CRYPTO_VAULT` ของตัวเอง
   แยก DB name กัน ใช้เก็บ Gemini API key แบบเข้ารหัสเหมือนกันทั้งคู่แล้ว — ไม่ใช่จุดต่างอีกต่อไป)
   การแก้ UI/feature เฉพาะเวอร์ชันให้แก้แค่ไฟล์นั้น ถ้า logic เป็น cross-cutting จริงๆ
   (data model, identity, sync) ให้ขึ้น module ใหม่ใน `shared/` แล้ว import เข้าทั้งสองไฟล์
   อย่า copy-paste logic เดียวกันซ้ำสองที่

3. **`shared/` เป็น ES module จริง โหลดตรงในเบราว์เซอร์.** ใช้ `export`/`import` และ
   `<script type="module">`, ห้ามพึ่ง bundler ให้ import ด้วย relative path (`./shared/xxx.js`)
   โมดูลใหม่ควรสื่อสารกับ `App` object ของแต่ละไฟล์ผ่าน callback ที่รับเข้ามาเป็นพารามิเตอร์
   (ตามแบบ `createSyncEngine({getLocalTasks, onRemoteChange, ...})`) ไม่ใช่แตะ DOM/`App` ตรงๆ
   เพื่อให้ mobile และ desktop ใช้โมดูลเดียวกันได้โดยไม่ต้องรู้จักกัน

4. **CSP meta tag ต้อง sync กันเป๊ะๆ ระหว่างสองไฟล์ HTML เสมอ.** ถ้าเพิ่ม external origin ใหม่
   (script/connect/img/font/style) ต้องแก้ `<meta http-equiv="Content-Security-Policy">`
   ในทั้ง `interactive_checklist_sd_mobile.html` และ `interactive_checklist_sd_app.html`
   ให้เหมือนกัน — ห้ามแก้แค่ไฟล์เดียว

5. **วินัยเรื่อง secrets:**
   - ห้าม commit PIN เป็น plaintext เด็ดขาด — เก็บได้แค่ SHA-256 hash ของ PIN เท่านั้น
     ถ้างานต้องใช้ PIN ให้ถามผู้ใช้ตรงๆ ในเซสชัน ห้ามเดาหรือใช้ค่าเดิมจาก session อื่น
   - ห้าม commit Firebase **service-account** secret หรือ credential ฝั่ง server ใดๆ
   - Client-side Firebase config ใน `shared/firebase-config.js` (`apiKey` ฯลฯ) เป็น
     **publishable key เปิดเผยได้ปกติ** ไม่ใช่ secret — ตอนนี้ใส่ค่าจริงของโปรเจกต์
     `t-dispatcher-465104-r2` แล้ว (ไม่ใช่ placeholder) ถ้าจะเปลี่ยนไปโปรเจกต์อื่นต้องถาม
     ผู้ใช้ให้ค่าจริงมาก่อนเสมอ ห้ามเดาหรือใส่ค่าเองโดยไม่ได้รับจากผู้ใช้
   - Gemini API key ของผู้ใช้ (คนละตัวกับ Firebase config) ต้องเก็บผ่าน `CRYPTO_VAULT`
     (AES-GCM ใน IndexedDB) เท่านั้น **ห้าม**เก็บ plaintext ใน `localStorage` อีก — ทั้ง mobile
     และ desktop ใช้ pattern นี้แล้ว (ดู `CRYPTO_VAULT`/`STORAGE_ENGINE` ในแต่ละไฟล์)

6. **ข้อมูลที่ sync ผ่าน Firestore ต้องถือว่าไม่น่าเชื่อถือเสมอ (untrusted).** เพราะ Firestore
   ใช้ anonymous auth + เปิดให้ authenticated client ใดๆ เขียนได้ (ดู `firestore.rules` และ
   หัวข้อ "การป้องกัน XSS" ใน `context.md`) — ค่าที่ sync มา (`textColor`, `id`, `description`
   ฯลฯ) จึงเท่ากับ user input จากเครื่องอื่นที่ควบคุมไม่ได้ ทุกจุดที่ interpolate ค่าพวกนี้เข้า
   HTML attribute (`class=`, `id=`, `data-*=`, `for=`) **ต้อง**ใช้ `safeColorClass()` หรือ
   `escapeAttr()`/`escapeHTML()` (แล้วแต่ไฟล์) ตามที่อธิบายไว้ใน `context.md` — ห้าม
   interpolate ดิบเด็ดขาด แม้จะดูเหมือนเป็นแค่ CSS class ก็ตาม ถ้าเพิ่ม Firestore rule ใหม่
   หรือ field ใหม่ที่ client เขียนได้ ให้เพิ่ม validation ใน `firestore.rules` ควบคู่ไปด้วย
   (จำกัดชนิด/ขนาด อย่างน้อย) ไม่ใช่พึ่งแค่ client-side sanitize อย่างเดียว

7. **ต้องรักษา offline-first behavior เสมอ.** ห้ามลบ/ปิด Firestore offline persistence
   (`enableIndexedDbPersistence`) หรือ IndexedDB storage ของ mobile version โดยไม่ตั้งใจ
   ทุก path ที่เรียก Firebase/Firestore ต้อง fail gracefully แล้ว fallback เป็น local-only
   (ดูตัวอย่างใน `shared/identity.js`/`shared/sync-engine.js` ที่ catch ทุก error และไม่ throw)

8. **ไม่มี automated test — verify ด้วยมือในเบราว์เซอร์.** เช่น เปิด `index.html` สองแท็บ/สอง
   เบราว์เซอร์ ทดสอบว่าติ๊ก subtask ในแท็บหนึ่งแล้วอีกแท็บ sync ตามหรือไม่ (ยืนยันแล้วว่าใช้งานได้
   จริงกับ Firebase project จริง), ทดสอบ offline ด้วย DevTools network throttling แล้วกลับมา
   online เพื่อดู queue flush, และถ้าแก้จุดที่ render ค่าจาก Firestore เป็น attribute ให้ทดสอบ
   ยิง payload แบบ `x" onmouseover="alert(1)` เข้า field นั้นด้วยเพื่อยืนยันว่ายัง sanitize อยู่

## Naming convention

- JS identifiers/function: `camelCase`
- ไฟล์ใหม่ใน `shared/`: `kebab-case.js`
- ข้อความที่ผู้ใช้เห็น (UI, README): ภาษาไทย
- โค้ด, comment, ชื่อตัวแปร: ภาษาอังกฤษ

## ก่อนเริ่มงานที่เกี่ยวกับ sync/auth/PIN

อ่าน `HANDOFF.md` §3–§7 ก่อนเสมอ — มีบันทึกการตัดสินใจของผู้ใช้ไว้แล้ว (เลือก Firebase,
ไม่มี real login แค่ anonymous auth + ชื่อที่กรอกเอง, PIN เป็น client-side gate เท่านั้นไม่ enforce
ที่ security rules ฯลฯ) เพื่อไม่ต้องถามคำถามเดิมซ้ำกับผู้ใช้ **Firebase config จริงถูกให้มาแล้ว**
(โปรเจกต์ `t-dispatcher-465104-r2`, ใช้งานจริงตั้งแต่คอมมิต `a736f54`) **PIN gate (Phase 5a)
เสร็จแล้ว** — `shared/pin-gate.js` เก็บแค่ SHA-256 hash ของ PIN ที่ผู้ใช้ให้มาตรงๆ ในเซสชัน
(ไม่เคย commit plaintext) ถ้างานต้องเปลี่ยน PIN ในอนาคตก็ยังต้องถามผู้ใช้ใหม่ทุกครั้งเหมือนเดิม
ห้ามเดาหรือ hardcode ขึ้นมาเอง — สิ่งที่ยังไม่ทำคือ presence/heartbeat (Phase 5b)

ถ้างานเกี่ยวข้องกับการเปลี่ยน/เพิ่ม field ที่ sync ผ่าน Firestore ให้อ่านกฎข้อ 6 ด้านบนก่อน
(untrusted data + ต้อง sanitize ทั้งฝั่ง client และเพิ่ม validation ใน `firestore.rules`)
