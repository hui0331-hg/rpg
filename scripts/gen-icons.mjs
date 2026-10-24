/**
 * 生成 PWA 图标（零依赖，纯 Node 手写 PNG）。
 *
 * 用法：node scripts/gen-icons.mjs
 * 产物：public/icon-192.png、public/icon-512.png、public/icon-512-maskable.png
 *
 * 为什么自己画：不引入 sharp/canvas 这类原生依赖，避免沙箱与安装脚本的坑。
 * 图案：深色底 + 金色菱形符文（与 App 的视觉基调一致）。
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, '..', 'public')

/* --------------------------- PNG 编码 --------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------- 图案绘制 --------------------------- */

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

const BG_IN = hex(0x1b2a44)
const BG_OUT = hex(0x070a11)
const GOLD = hex(0xe8c87a)
const GOLD_DEEP = hex(0xb8893c)
const GOLD_LIGHT = hex(0xffe9b0)
const SPARK = hex(0xfff8e0)

/**
 * 归一化坐标 nx,ny ∈ [-1,1] 上的着色。
 * scale 用于 maskable 版把图案缩小进安全区。
 */
function shade(nx0, ny0, scale) {
  const nx = nx0 / scale
  const ny = ny0 / scale

  // 背景：径向渐变
  const dc = clamp01(Math.hypot(nx0, ny0))
  const bgT = dc * dc
  let r = lerp(BG_IN[0], BG_OUT[0], bgT)
  let g = lerp(BG_IN[1], BG_OUT[1], bgT)
  let b = lerp(BG_IN[2], BG_OUT[2], bgT)

  if (Math.abs(nx) > 1.3 || Math.abs(ny) > 1.3) return [r, g, b]

  const d1 = Math.abs(nx) + Math.abs(ny) // 菱形距离

  // 外圈光晕
  const glow = Math.exp(-Math.pow((d1 - 0.8) / 0.11, 2)) * 0.42
  if (glow > 0.002) {
    r = lerp(r, GOLD[0], glow)
    g = lerp(g, GOLD[1], glow)
    b = lerp(b, GOLD[2], glow)
  }

  // 菱形外框
  if (Math.abs(d1 - 0.8) <= 0.045) {
    const edge = 1 - Math.abs(d1 - 0.8) / 0.045
    const a = clamp01(0.55 + edge * 0.45)
    r = lerp(r, GOLD[0], a)
    g = lerp(g, GOLD[1], a)
    b = lerp(b, GOLD[2], a)
  }

  // 内菱形实心（金色渐变）
  if (d1 <= 0.44) {
    const fy = clamp01((ny + 0.44) / 0.88) // 0=上沿 1=下沿
    const br = lerp(GOLD_LIGHT[0], GOLD_DEEP[0], fy)
    const bg = lerp(GOLD_LIGHT[1], GOLD_DEEP[1], fy)
    const bb = lerp(GOLD_LIGHT[2], GOLD_DEEP[2], fy)
    r = br
    g = bg
    b = bb
  }

  // 中心高光
  if (d1 <= 0.15) {
    const a = 1 - d1 / 0.15
    r = lerp(r, SPARK[0], clamp01(a * 1.4))
    g = lerp(g, SPARK[1], clamp01(a * 1.4))
    b = lerp(b, SPARK[2], clamp01(a * 1.4))
  }

  return [r, g, b]
}

function renderIcon(size, scale = 1) {
  const buf = Buffer.alloc(size * size * 4)
  const SS = 4 // 每像素 4x4 超采样做抗锯齿
  const inv = 1 / size

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ar = 0
      let ag = 0
      let ab = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) * inv
          const py = (y + (sy + 0.5) / SS) * inv
          const nx = px * 2 - 1
          const ny = py * 2 - 1
          const [r, g, b] = shade(nx, ny, scale)
          ar += r
          ag += g
          ab += b
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      buf[i] = Math.round(ar / n)
      buf[i + 1] = Math.round(ag / n)
      buf[i + 2] = Math.round(ab / n)
      buf[i + 3] = 255
    }
  }
  return encodePng(size, size, buf)
}

mkdirSync(PUBLIC_DIR, { recursive: true })

const jobs = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-512-maskable.png', size: 512, scale: 0.72 },
]

for (const job of jobs) {
  const png = renderIcon(job.size, job.scale)
  writeFileSync(join(PUBLIC_DIR, job.file), png)
  console.log(`✓ ${job.file} (${job.size}×${job.size}, ${(png.length / 1024).toFixed(1)} KB)`)
}
