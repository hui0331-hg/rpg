/**
 * 多日趋势统计（M2）—— 全部从日志推导，不额外存冗余字段，
 * 所以历史调整（比如改了平衡表）不会污染已有记录。
 */
import { CORE_META, CORE_ORDER } from '../data/meta'
import { dateKeyOf, shiftDateKey } from './engine'
import type { AppState, CoreKey } from '../types'

export interface DayPoint {
  dateKey: string
  /** 星期几，例如「周一」 */
  label: string
  pool: number
  logs: number
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

export function dailyPoolSeries(state: AppState, days = 7, now: Date = new Date()): DayPoint[] {
  const today = dateKeyOf(now)
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) keys.push(shiftDateKey(today, -i))

  const byDay = new Map<string, { pool: number; logs: number }>()
  for (const k of keys) byDay.set(k, { pool: 0, logs: 0 })
  for (const log of state.logs) {
    const slot = byDay.get(log.dateKey)
    if (!slot) continue
    slot.pool += log.pool
    slot.logs += 1
  }

  return keys.map((dateKey) => {
    const [y, m, d] = dateKey.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    const isToday = dateKey === today
    const slot = byDay.get(dateKey) ?? { pool: 0, logs: 0 }
    return {
      dateKey,
      label: isToday ? '今天' : `周${WEEKDAY[dt.getDay()]}`,
      pool: Math.round(slot.pool * 10) / 10,
      logs: slot.logs,
    }
  })
}

export interface TaskStats {
  createdAt: number
  done: number
  cancelled: number
  /** 0~1，没有数据时为 null */
  rate: number | null
}

export function taskStats(state: AppState, days = 7, now: Date = new Date()): TaskStats {
  const from = shiftDateKey(dateKeyOf(now), -(days - 1))
  const windowTasks = state.tasks.filter((t) => t.dateKey >= from)
  const done = windowTasks.filter((t) => t.state === 'done').length
  const cancelled = windowTasks.filter((t) => t.state === 'cancelled').length
  const settled = done + cancelled
  return {
    createdAt: windowTasks.length,
    done,
    cancelled,
    rate: settled === 0 ? null : done / settled,
  }
}

export interface AttributeGain {
  key: CoreKey
  name: string
  color: string
  points: number
}

/** 近 N 天主属性增长，按从多到少排序 */
export function attributeGains(
  state: AppState,
  days = 7,
  now: Date = new Date(),
): AttributeGain[] {
  const from = shiftDateKey(dateKeyOf(now), -(days - 1))
  const sums = {} as Record<CoreKey, number>
  for (const k of CORE_ORDER) sums[k] = 0

  for (const log of state.logs) {
    if (log.dateKey < from) continue
    for (const g of log.grants) {
      if (g.kind === 'core') sums[g.key as CoreKey] = (sums[g.key as CoreKey] ?? 0) + g.points
    }
  }

  return CORE_ORDER.map((key) => ({
    key,
    name: CORE_META[key].name,
    color: CORE_META[key].color,
    points: Math.round(sums[key] * 10) / 10,
  })).sort((a, b) => b.points - a.points)
}

/** 连续活跃天数（从最近一天往回数），用于校验存档里的 streak 是否真实 */
export function activeStreak(state: AppState, now: Date = new Date()): number {
  const activeDays = new Set(state.logs.map((l) => l.dateKey))
  let cursor = dateKeyOf(now)
  if (!activeDays.has(cursor)) cursor = shiftDateKey(cursor, -1)
  let streak = 0
  while (activeDays.has(cursor)) {
    streak++
    cursor = shiftDateKey(cursor, -1)
  }
  return streak
}
