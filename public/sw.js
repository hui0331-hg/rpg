/* 个人RPG系统 Service Worker
 *
 * 策略：
 * - 导航请求（打开页面）：网络优先，断网回退到缓存的 index.html
 * - 其他同源 GET（js/css/图片）：stale-while-revalidate
 *
 * 说明：Vite 产物文件名带 hash，无法在 install 阶段预知，
 * 因此走运行时缓存；首次成功加载后即可离线。发版时改 VERSION 即可清旧缓存。
 */
const VERSION = 'v1'
const SHELL_CACHE = `rpg-shell-${VERSION}`
const RUNTIME_CACHE = `rpg-runtime-${VERSION}`
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 页面导航：网络优先
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() =>
          caches
            .match('./index.html')
            .then((cached) => cached || caches.match('./'))
            .then(
              (cached) =>
                cached ||
                new Response('离线状态，且没有可用缓存。', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                }),
            ),
        ),
    )
    return
  }

  // 静态资源：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
