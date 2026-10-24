/**
 * 极简静态服务器（零依赖），用于本机/局域网预览 dist 产物。
 *
 * 用法：
 *   pnpm build && node scripts/serve.mjs [端口]
 *
 * 注意：局域网 http:// 访问时浏览器不把它当安全上下文，
 * Service Worker 与「安装到主屏幕」不会生效 —— 正式上机请用 HTTPS 托管（GitHub Pages）。
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { networkInterfaces } from 'node:os'

const PORT = Number(process.argv[2] ?? 4173)
const ROOT = resolve(process.cwd(), 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    let filePath = join(ROOT, normalize(urlPath))

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden')
      return
    }

    let info = await stat(filePath).catch(() => null)
    if (!info || info.isDirectory()) {
      filePath = join(ROOT, 'index.html')
      info = await stat(filePath).catch(() => null)
    }
    if (!info) {
      res.writeHead(404).end('Not found')
      return
    }

    const data = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(data)
  } catch (err) {
    res.writeHead(500).end(`Server error: ${err.message}`)
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  本地预览:  http://localhost:${PORT}/`)
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  局域网:    http://${net.address}:${PORT}/`)
      }
    }
  }
  console.log('\n  (Ctrl+C 停止)\n')
})
