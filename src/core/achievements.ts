/**
 * 成就判定与解锁。
 *
 * 关键原则：成就**永远从存档复算**，不存「我完成了什么」这种主观判断。
 * 存档里只记「什么时候解锁的」，所以即使以后调整了达成线，
 * 已解锁的也不会被撤销，且随时能核对是否算得对。
 */
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_MAP,
  type AchievementCtx,
  type AchievementDef,
} from '../data/achievements'
import { CORE_ORDER } from '../data/meta'
import { dateKeyOf, longestStreakOfDateKeys } from './time'
import type { AppState, AchievementRecord } from '../types'

export function computeAchievementCtx(state: AppState): AchievementCtx {
  const ch = state.character
  const dateKeys = state.logs.map((l) => l.dateKey)

  let totalXp = 0
  let runKm = 0
  let wordsCount = 0
  let studyMinutes = 0
  let sleepCount = 0

  for (const log of state.logs) {
    totalXp += log.pool
    if (log.kind !== 'activity') continue
    if (log.activityKey === 'run') runKm += log.amount ?? 0
    if (log.activityKey === 'words') wordsCount += log.amount ?? 0
    if (log.activityKey === 'study') studyMinutes += log.amount ?? 0
    if (log.activityKey === 'sleep') sleepCount += 1
  }

  const coreLevels = CORE_ORDER.map((k) => ch?.core[k].level ?? 1)
  const tasksDone = state.tasks.filter((t) => t.state === 'done').length

  return {
    totalLogs: state.logs.length,
    logDays: new Set(dateKeys).size,
    totalXp: Math.round(totalXp * 10) / 10,
    longestStreak: longestStreakOfDateKeys(dateKeys),
    currentStreak: ch?.streakDays ?? 0,
    maxCoreLevel: Math.max(...coreLevels),
    minCoreLevel: Math.min(...coreLevels),
    charLevel: ch?.level ?? 1,
    tasksDone,
    runKm: Math.round(runKm * 10) / 10,
    wordsCount,
    studyMinutes,
    sleepCount,
  }
}

export interface AchievementState {
  state: AppState
  unlocked: AchievementDef[]
}

/**
 * 检查并写入新解锁的成就。
 * 每次结算后调用，幂等：已解锁的不会被重复添加。
 */
export function applyAchievements(state: AppState, now: Date = new Date()): AchievementState {
  const ctx = computeAchievementCtx(state)
  const owned = new Set(state.achievements.map((a) => a.id))
  const unlocked: AchievementDef[] = []
  const records: AchievementRecord[] = []

  for (const def of ACHIEVEMENTS) {
    if (owned.has(def.id)) continue
    if (def.value(ctx) >= def.target) {
      unlocked.push(def)
      records.push({ id: def.id, unlockedAt: now.toISOString() })
    }
  }

  if (records.length === 0) return { state, unlocked }

  return {
    state: { ...state, achievements: [...state.achievements, ...records] },
    unlocked,
  }
}

export interface AchievementView extends AchievementDef {
  unlocked: boolean
  unlockedAt?: string
  current: number
  ratio: number
}

export function achievementViews(state: AppState): AchievementView[] {
  const ctx = computeAchievementCtx(state)
  const ownedMap = new Map(state.achievements.map((a) => [a.id, a.unlockedAt]))

  const views = ACHIEVEMENTS.map((def) => {
    const current = def.value(ctx)
    const unlockedAt = ownedMap.get(def.id)
    return {
      ...def,
      unlocked: Boolean(unlockedAt),
      unlockedAt,
      current: Math.round(Math.min(current, def.target) * 10) / 10,
      ratio: Math.min(1, def.target === 0 ? 1 : current / def.target),
    }
  })

  const tierOrder = { gold: 0, silver: 1, bronze: 2 }
  return views.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
    if (a.unlocked && b.unlocked) {
      return (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? '')
    }
    return b.ratio - a.ratio || tierOrder[a.tier] - tierOrder[b.tier]
  })
}

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_MAP[id]
}

export function unlockedCount(state: AppState): number {
  return state.achievements.length
}

/** 最近解锁的 N 个（按时间倒序） */
export function recentUnlocked(state: AppState, n = 3): AchievementRecord[] {
  return [...state.achievements]
    .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))
    .slice(0, n)
}

/** 今日是否有记录（给「今天还没开始」这类文案用） */
export function hasLoggedToday(state: AppState, now: Date = new Date()): boolean {
  const key = dateKeyOf(now)
  return state.logs.some((l) => l.dateKey === key)
}
