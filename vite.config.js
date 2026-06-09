import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 設成相對路徑 './'，這樣本機 preview 與 GitHub Pages(專案站 /repo-name/) 都能正確讀資源。
// 若部署到自訂網域根目錄，可改成 '/'。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
})
