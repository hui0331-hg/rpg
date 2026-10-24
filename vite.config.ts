import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 让产物用相对路径引用资源：
// 既能挂在 GitHub Pages 的 /<repo>/ 子路径下，也能被 file:// 直接打开，无需改配置。
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
