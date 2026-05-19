# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Supabase (ฐานข้อมูลแบบตาราง users)

โปรเจคนี้รองรับการล็อกอินแบบ `รหัสนักเรียน + รหัสผ่าน` ผ่าน Supabase RPC และดึงรายชื่อสมาชิกจาก Supabase ได้ (ถ้าตั้งค่า env แล้ว)

1) สร้างโปรเจคใน Supabase แล้วคัดลอก `Project URL` และ `anon key`
2) สร้างไฟล์ `.env` จาก `.env.example` แล้วใส่ค่า:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3) เปิด Supabase SQL Editor แล้วรันไฟล์ `supabase/schema.sql`
4) (ถ้าต้องการ) รัน `supabase/seed.sql` เพื่อใส่ผู้ใช้ตัวอย่าง

หมายเหตุ: `supabase/schema.sql` เป็นสคีมาพื้นฐานสำหรับเดโม/ใช้งานภายใน (เรื่อง RLS/Policy ควรเสริมก่อนใช้จริงแบบปลอดภัย)
