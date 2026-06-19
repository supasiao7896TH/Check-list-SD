# Check-list-SD

เช็คลิสต์ขั้นตอน **Shut-Down** หน่วย PTA — แอปเว็บแบบ PWA มี 2 เวอร์ชันแยกกัน (มือถือ + PC)
เหมือนโครงสร้างของ Check-list-SU

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | หน้า landing เลือกเปิดเวอร์ชันมือถือหรือ PC + ลงทะเบียน service worker |
| `interactive_checklist_sd_mobile.html` | เวอร์ชันมือถือ (PWA) — bottom tab bar: รายการงาน / แดชบอร์ด / เครื่องมือ, ปุ่มเพิ่มงานลอย (FAB), เก็บข้อมูลด้วย IndexedDB |
| `interactive_checklist_sd_app.html` | เวอร์ชัน PC/desktop — หน้าจอกว้าง เครื่องมือครบ (dashboard, kanban, AI) |
| `manifest.webmanifest` | PWA manifest (ติดตั้งเป็นแอปได้) |
| `sw.js` | service worker (ใช้งานออฟไลน์ได้) |
| `icon-*.png`, `apple-touch-icon.png` | ไอคอนแอป |
| `.nojekyll` | ปิด Jekyll สำหรับ GitHub Pages |

## วิธีใช้งาน

1. เปิด `index.html`
2. เลือก **เปิดเวอร์ชันมือถือ (PWA)** สำหรับใช้บนมือถือ (ติดตั้งเป็นแอป/ใช้ออฟไลน์ได้)
   หรือ **เปิดเวอร์ชัน PC** สำหรับใช้บนจอกว้าง
3. ติดตั้งเป็นแอปบนมือถือ: เปิดเวอร์ชันมือถือ → เมนู ⋮ ของ Chrome → "ติดตั้งแอป" / "เพิ่มลงในหน้าจอหลัก"

## ข้อมูลรายการงาน

ทั้งสองเวอร์ชันใช้โครงสร้างข้อมูลงาน (task) เหมือนกัน จึง **export/import ไฟล์ JSON ข้ามเวอร์ชันได้**
ปัจจุบันมีรายการงาน Shut-Down ตัวอย่างใน `getDefaultTasks()` / `INITIAL_TASKS_JSON`
(รายการงานจริงทั้งหมดจะเพิ่มภายหลัง)
