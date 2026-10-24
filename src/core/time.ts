/**
 * 时间与 id 工具。
 *
 * 单独抽出来是为了解开循环依赖：
 * engine ← achievements ← engine 会成环，所以凡是「到处都要用、且不依赖业务」的东西放这里。
 */

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 本地日期 YYYY-MM-DD（不用 toISOString，避免时区偏移串日期） */
export function dateKeyOf(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 相对某个 dateKey 平移若干天 */
export function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return dateKeyOf(dt)
}

/** 两个 dateKey 相差多少天（b - a） */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const ta = new Date(ay, am - 1, ad).getTime()
  const tb = new Date(by, bm - 1, bd).getTime()
  return Math.round((tb - ta) / 86_400_000)
}

/** 按时间顺序排出所有有记录的日期，并计算最长连续天数 */
export function longestStreakOfDateKeys(dateKeys: string[]): number {
  const uniq = [...new Set(dateKeys)].sort()
  if (uniq.length === 0) return 0
  let best = 1
  let cur = 1
  for (let i = 1; i < uniq.length; i++) {
    if (daysBetween(uniq[i - 1], uniq[i]) === 1) {
      cur += 1
    } else {
      cur = 1
    }
    if (cur > best) best = cur
  }
  return best
}
