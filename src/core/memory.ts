/**
 * 长期记忆（M3）。
 *
 * 问题：模型不可能记住你一年的日志，而把全部历史塞进 prompt 又贵又慢。
 * 做法：**从存档里算出确定性摘要**（习惯、停滞、里程碑、本周增长），
 * 再把这几行喂给 AI。摘要永远可复算，模型编不出你的历史。
 *
 * 注意：这里只产出「事实」，不做安慰或评价 —— 评价交给 AI 的可选润色层。
 */
import { ACTIVITY_MAP } from '../data/activities'
import { ACHIEVEMENT_MAP } from '../data/achievements'
import { CORE_META, CORE_ORDER } from '../data/meta'
import { recentUnlocked } from './achievements'
import { dateKeyOf, longestStreakOfDateKeys, shiftDateKey } from './time'
import type { AppState, CoreKey } from '../types'

export interface ActivityStat {
  key: string
  name: string
  count: number
  amount: number
  unit: string
}

export interface MemoryDigest {
  daysLogged: number
  totalLogs: number
  totalXp: number
  currentStreak: number
  longestStreak: number
  charLevel: number
  lastActiveDate: string | null
  todayLogged: boolean
  /** 近 7 天 */
  week: {
    pool: number
    activeDays: number
    gains: Record<CoreKey, number>
  }
  topActivities: ActivityStat[]
  /** 近 14 天出现 ≥5 次的活动 */
  habits: string[]
  /** 近 10 天完全没有增长的主属性 */
  stale: string[]
  milestones: string[]
  goals: string[]
  pending: string[]
  achievements: string[]
}

const HABIT_WINDOW_DAYS = 14
const HABIT_MIN_COUNT = 5
const STALE_DAYS = 10
const TOP_WINDOW_DAYS = 30

export function buildMemoryDigest(state: AppState, now: Date = new Date()): MemoryDigest {
  const today = dateKeyOf(now)
  const ch = state.character

  const habitFrom = shiftDateKey(today, -(HABIT_WINDOW_DAYS - 1))
  const topFrom = shiftDateKey(today, -(TOP_WINDOW_DAYS - 1))
  const weekFrom = shiftDateKey(today, -6)
  const staleFrom = shiftDateKey(today, -(STALE_DAYS - 1))

  const activityCount = new Map<string, { count: number; amount: number }>()
  const weekGains = {} as Record<CoreKey, number>
  const lastGainDate = {} as Record<CoreKey, string | null>
  for (const k of CORE_ORDER) {
    weekGains[k] = 0
    lastGainDate[k] = null
  }

  let weekPool = 0
  const weekDays = new Set<string>()
  const allDays = new Set<string>()

  for (const log of state.logs) {
    allDays.add(log.dateKey)

    if (log.dateKey >= weekFrom) {
      weekPool += log.pool
      weekDays.add(log.dateKey)
      for (const g of log.grants) {
        if (g.kind === 'core') {
          weekGains[g.key as CoreKey] = (weekGains[g.key as CoreKey] ?? 0) + g.points
        }
      }
    }

    // 每个主属性最近一次增长（不限窗口）
    for (const g of log.grants) {
      if (g.kind !== 'core') continue
      const key = g.key as CoreKey
      const prev = lastGainDate[key]
      if (!prev || log.dateKey > prev) lastGainDate[key] = log.dateKey
    }

    if (log.kind === 'activity' && log.activityKey && log.dateKey >= topFrom) {
      const slot = activityCount.get(log.activityKey) ?? { count: 0, amount: 0 }
      slot.count += 1
      slot.amount += log.amount ?? 0
      activityCount.set(log.activityKey, slot)
    }
  }

  const topActivities: ActivityStat[] = [...activityCount.entries()]
    .map(([key, v]) => {
      const def = ACTIVITY_MAP[key]
      return {
        key,
        name: def?.name ?? key,
        count: v.count,
        amount: Math.round(v.amount * 10) / 10,
        unit: def?.unit ?? '',
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)

  const habits = topActivities
    .filter((a) => {
      // 只统计近 14 天：重新数一遍，避免窗口混用
      const count = state.logs.filter(
        (l) => l.activityKey === a.key && l.dateKey >= habitFrom,
      ).length
      return count >= HABIT_MIN_COUNT
    })
    .map((a) => a.name)

  const stale = CORE_ORDER.filter((key) => {
    const last = lastGainDate[key]
    if (!last) return state.logs.length > 0
    return last < staleFrom
  }).map((key) => CORE_META[key].name)

  const milestones: string[] = []
  milestones.push(`累计 ${state.logs.length} 条记录，${allDays.size} 天有记录`)
  if (ch) {
    milestones.push(`综合等级 Lv.${ch.level}`)
    milestones.push(`当前连击 ${ch.streakDays} 天`)
  }
  const recent = recentUnlocked(state, 3)
  if (recent.length > 0) {
    const names = recent
      .map((a) => ACHIEVEMENT_MAP[a.id]?.name)
      .filter(Boolean)
      .join('、')
    milestones.push(`已解锁 ${state.achievements.length} 个成就（最近：${names}）`)
  }

  return {
    daysLogged: allDays.size,
    totalLogs: state.logs.length,
    totalXp: Math.round(state.logs.reduce((s, l) => s + l.pool, 0) * 10) / 10,
    currentStreak: ch?.streakDays ?? 0,
    longestStreak: longestStreakOfDateKeys([...allDays]),
    charLevel: ch?.level ?? 1,
    lastActiveDate: ch?.lastActiveDate ?? null,
    todayLogged: allDays.has(today),
    week: {
      pool: Math.round(weekPool * 10) / 10,
      activeDays: weekDays.size,
      gains: Object.fromEntries(
        CORE_ORDER.map((k) => [k, Math.round(weekGains[k] * 10) / 10]),
      ) as Record<CoreKey, number>,
    },
    topActivities,
    habits,
    stale,
    milestones,
    goals: ch?.goals ?? [],
    pending: state.tasks.filter((t) => t.state === 'pending').map((t) => t.title),
    achievements: state.achievements.map((a) => ACHIEVEMENT_MAP[a.id]?.name ?? a.id),
  }
}

/**
 * 压缩成几行 prompt 文本。
 * 控制在 ~10 行以内：够模型理解你，又不至于把上下文吃掉。
 */
export function memoryToPromptLines(d: MemoryDigest): string {
  const lines: string[] = []
  lines.push(`- 已记录 ${d.daysLogged} 天 / 共 ${d.totalLogs} 条；当前连击 ${d.currentStreak} 天`)

  const gains = CORE_ORDER.map((k) => `${CORE_META[k].name}+${d.week.gains[k]}`).join(' ')
  lines.push(`- 本周：经验 ${d.week.pool}，活跃 ${d.week.activeDays}/7 天；属性增长 ${gains}`)

  if (d.habits.length > 0) lines.push(`- 稳定习惯：${d.habits.join('、')}`)
  if (d.topActivities.length > 0) {
    const tops = d.topActivities
      .slice(0, 3)
      .map((a) => `${a.name}(${a.count}次)`)
      .join('、')
    lines.push(`- 近 30 天常做：${tops}`)
  }
  if (d.stale.length > 0) lines.push(`- 明显停滞（${STALE_DAYS} 天无增长）：${d.stale.join('、')}`)
  if (d.goals.length > 0) lines.push(`- 用户目标：${d.goals.join('；')}`)
  if (d.pending.length > 0) lines.push(`- 未完成任务：${d.pending.slice(0, 5).join('；')}`)
  if (d.achievements.length > 0) {
    lines.push(`- 已解锁成就：${d.achievements.slice(-5).join('、')}`)
  }
  return lines.join('\n')
}
