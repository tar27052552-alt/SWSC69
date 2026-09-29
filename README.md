# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## ตั้งค่าระบบ

คัดลอก `.env.example` เป็น `.env` และกำหนด `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GAS_URL` และ `VITE_ONESIGNAL_APP_ID` ตามสภาพแวดล้อม ระบบ production ใช้ Supabase Auth และ RLS; ห้ามใช้ `supabase/schema.sql` เป็นการตั้งค่า production ใหม่โดยไม่ตรวจ migrations ก่อน

สำหรับตั้งค่าและเผยแพร่ Apps Script / Vercel อย่างปลอดภัย ดู [SECURITY_DEPLOYMENT.md](SECURITY_DEPLOYMENT.md).
