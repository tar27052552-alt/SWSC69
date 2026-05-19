import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/SWSC69/', // กำหนดชื่อ repository ตรงนี้
  plugins: [
    react(),
    tailwindcss(),
  ],
})
