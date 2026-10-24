import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { GameProvider } from './state/store'
import './styles.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('找不到 #root 挂载点')

createRoot(rootEl).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
)

// 注册 Service Worker（仅生产构建、非 file:// 环境）
if ('serviceWorker' in navigator && location.protocol !== 'file:' && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[PWA] Service Worker 注册失败：', err)
    })
  })
}
