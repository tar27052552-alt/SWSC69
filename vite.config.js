import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/SWSC69/', // กำหนดชื่อ repository ตรงนี้
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    watch: {
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/*.txt',
        '**/*.jsonl',
        '**/*.jpg',
        '**/*.png',
        '**/*.cjs',
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve('./index.html'),
        admin: resolve('./admin/index.html'),
      },
    },
  },
})
