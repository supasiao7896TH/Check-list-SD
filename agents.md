# agents.md — กฎสำหรับ AI agent ที่ทำงานในรีโปนี้

อ่าน [`context.md`](./context.md) ก่อนเพื่อเข้าใจสถาปัตยกรรม และดู [`HANDOFF.md`](./HANDOFF.md)
ถ้างานเกี่ยวข้องกับ Firebase sync / identity / PIN gate (มีรายละเอียดการตัดสินใจที่ทำไว้แล้ว
และ TODO ที่ยังค้าง — Phase 5 PIN gate + presence, Phase 6 live testing)

## กฎหลัก

1. **ห้ามเพิ่ม build step.** โปรเจกต์นี้ตั้งใจเป็น static-file app ไม่มี `package.json`,
   bundler, transpiler, หรือ test framework ใดๆ — อย่าเพิ่มโดยไม่มีคนขอ ถ้าจะเพิ่ม dependency
   ใหม่ ให้โหลดผ่าน CDN `<script>` หรือ ES module `import` เหมือนของเดิม

2. **Mobile กับ Desktop คือคนละไฟล์ที่ตั้งใจแยกกัน — ห้าม merge เป็นไฟล์เดียว.**
   `interactive_checklist_sd_mobile.html` (IndexedDB, `CRYPTO_VAULT`) กับ
   `interactive_checklist_sd_app.html` (`localStorage`) มี persistence engine, layout,
   และ state ของตัวเองแยกกัน การแก้ UI/feature เฉพาะเวอร์ชันให้แก้แค่ไฟล์นั้น ถ้า logic
   เป็น cross-cutting จริงๆ (data model, identity, sync) ให้ขึ้น module ใหม่ใน `shared/`
   แล้ว import เข้าทั้งสองไฟล์ อย่า copy-paste logic เดียวกันซ้ำสองที่

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
     **publishable key เปิดเผยได้ปกติ** ไม่ใช่ secret — แต่ต้องคง placeholder
     (`REPLACE_WITH_REAL_FIREBASE_CONFIG`) ไว้จนกว่าผู้ใช้จะให้ค่าโปรเจกต์ Firebase จริง
     ห้ามใส่ค่าจริงเองโดยไม่ได้รับจากผู้ใช้

6. **ต้องรักษา offline-first behavior เสมอ.** ห้ามลบ/ปิด Firestore offline persistence
   (`enableIndexedDbPersistence`) หรือ IndexedDB storage ของ mobile version โดยไม่ตั้งใจ
   ทุก path ที่เรียก Firebase/Firestore ต้อง fail gracefully แล้ว fallback เป็น local-only
   (ดูตัวอย่างใน `shared/identity.js`/`shared/sync-engine.js` ที่ catch ทุก error และไม่ throw)

7. **ไม่มี automated test — verify ด้วยมือในเบราว์เซอร์.** เช่น เปิด `index.html` สองแท็บ/สอง
   เบราว์เซอร์ ทดสอบว่าติ๊ก subtask ในแท็บหนึ่งแล้วอีกแท็บ sync ตามหรือไม่ (ถ้ามี Firebase config
   จริงแล้ว), ทดสอบ offline ด้วย DevTools network throttling แล้วกลับมา online เพื่อดู queue flush

## Naming convention

- JS identifiers/function: `camelCase`
- ไฟล์ใหม่ใน `shared/`: `kebab-case.js`
- ข้อความที่ผู้ใช้เห็น (UI, README): ภาษาไทย
- โค้ด, comment, ชื่อตัวแปร: ภาษาอังกฤษ

## ก่อนเริ่มงานที่เกี่ยวกับ sync/auth/PIN

อ่าน `HANDOFF.md` §3–§7 ก่อนเสมอ — มีบันทึกการตัดสินใจของผู้ใช้ไว้แล้ว (เลือก Firebase,
ไม่มี real login แค่ anonymous auth + ชื่อที่กรอกเอง, PIN เป็น client-side gate เท่านั้นไม่ enforce
ที่ security rules ฯลฯ) เพื่อไม่ต้องถามคำถามเดิมซ้ำกับผู้ใช้ แต่ **ค่า PIN จริงและ Firebase config
จริงยังไม่เคยถูกให้มา** — ต้องถามผู้ใช้เองในเซสชันที่ทำงานเรื่องนี้ ห้ามเดาหรือ hardcode ขึ้นมาเอง
