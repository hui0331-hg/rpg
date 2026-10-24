/**
 * 结算引擎 —— 本项目的核心。所有数值变化都必须经过这里。
 *
 * 关键保证：
 * - 纯确定性：同样的输入 + 同样的存档，永远得到同样的结果（AI 不参与计算）。
 * - 可追溯：每条 LogEntry 记下 diminish / streakBonus / rawPool / pool / grants。
 * - 防刷：同类活动递减 + 每日经验池上限 + 单项输入量上限。
 * - 预览=实结算：UI 的「预计收益」与真正入账走同一个 computeActivity。
 */
import { BALANCE } from '../data/balance'
import { ACTIVITY_MAP, type ActivityDef } from '../data/activities'
import { CORE_META, SKILL_META } from '../data/meta'
import { newTrack, round1 } from './curve'
import { addXp } from './curve'
import { applyAchievements } from './achievements'
import { dateKeyOf, shiftDateKey, uid } from './time'
import type {
  AppState,
  Character,
  CoreKey,
  Grant,
  LevelUp,
  LogEntry,
  SkillKey,
  Task,
} from '../types'

/* ------------------------------- 小工具 ------------------------------- */

// 时间/id 工具已抽到 core/time.ts（避免与 achievements 形成循环依赖），
// 这里原样再导出，保持既有 import 路径不变。
export { dateKeyOf, shiftDateKey, uid } from './time'

/**
 * 本次结算之后将会达到的连击天数。
 *
 * 为什么需要它：如果直接用「已记录的 streakDays」算加成，加成会滞后一天
 * （第 2 天的加成要用第 1 天存的数字，而那时还是 0）。所以按「结算完会变成几」来算：
 *   今天已经记过 → 沿用当前天数
 *   昨天记过     → 当前天数 + 1
 *   否则（断签/新号） → 1
 */
export function prospectiveStreak(character: Character, dateKey: string): number {
  if (character.lastActiveDate === dateKey) return Math.max(1, character.streakDays)
  const yesterday = shiftDateKey(dateKey, -1)
  if (character.lastActiveDate === yesterday) return character.streakDays + 1
  return 1
}

/**
 * 连击加成系数。
 * 第 1 天不给加成（=1.0），这样新用户「跑 5km → 健康+2 魅力+2」与设计值完全一致；
 * 从第 2 天起每天 +5%，最多 +30%。
 *
 * 注意：这里必须保留 3 位小数。加成步长是 0.05，若按 1 位小数取整，
 * 1.05 会被四舍五入成 1.1，等于把首日加成直接翻倍。
 */
export function streakMultiplier(streakDays: number, enabled = true): number {
  if (!enabled) return 1
  const steps = Math.max(0, streakDays - 1)
  const maxSteps = Math.round(BALANCE.streak.max / BALANCE.streak.step)
  const value = 1 + BALANCE.streak.step * Math.min(steps, maxSteps)
  return Math.round(value * 1000) / 1000
}

/* ----------------------------- 活动结算 ----------------------------- */

export interface ActivityComputation {
  ok: true
  def: ActivityDef
  amount: number
  dateKey: string
  todayIndex: number
  diminish: number
  streakBonus: number
  rawPool: number
  pool: number
  capped: boolean
  /** 为什么收益被砍（给用户看的解释） */
  reasons: string[]
  grants: Grant[]
}

export type ActivityOutcome =
  | { ok: true; state: AppState; entry: LogEntry; computation: ActivityComputation }
  | { ok: false; error: string }

function clampAmount(def: ActivityDef, amount: number): number {
  if (!Number.isFinite(amount)) return def.defaultAmount
  const snapped = Math.round(amount / def.step) * def.step
  return Math.max(def.step, Math.min(def.maxAmount, snapped))
}

function spentPool(state: AppState, dateKey: string, kind: 'activity' | 'task'): number {
  return state.logs
    .filter((l) => l.dateKey === dateKey && l.kind === kind)
    .reduce((sum, l) => sum + l.pool, 0)
}

/** 计算（不改状态）：预览与实结算共用 */
export function computeActivity(
  state: AppState,
  activityKey: string,
  rawAmount: number,
  now: Date = new Date(),
): ActivityComputation | { ok: false; error: string } {
  const def = ACTIVITY_MAP[activityKey]
  if (!def) return { ok: false, error: '未知的活动类型' }

  const dateKey = dateKeyOf(now)
  const amount = clampAmount(def, rawAmount)
  const reasons: string[] = []

  const todayCount = state.logs.filter(
    (l) => l.kind === 'activity' && l.dateKey === dateKey && l.activityKey === def.key,
  ).length
  const diminish =
    BALANCE.diminish[Math.min(todayCount, BALANCE.diminish.length - 1)] ?? 0
  if (diminish < 1) {
    reasons.push(
      diminish <= 0
        ? `今天已经记过 ${todayCount} 次「${def.name}」，再记不再加分`
        : `今天第 ${todayCount + 1} 次「${def.name}」，收益系数 ${Math.round(diminish * 100)}%`,
    )
  }

  const prospect = state.character
    ? prospectiveStreak(state.character, dateKey)
    : 1
  const streakBonus = streakMultiplier(prospect, state.settings.streakEnabled)
  if (streakBonus > 1) {
    reasons.push(`连击 ${prospect} 天，加成 +${Math.round((streakBonus - 1) * 100)}%`)
  }

  const rawPool = round1(def.pool(amount))
  let pool = round1(rawPool * diminish * streakBonus)

  // 每日经验池上限
  const remaining = Math.max(0, state.settings.dailyPoolCap - spentPool(state, dateKey, 'activity'))
  let capped = false
  if (pool > remaining) {
    pool = round1(remaining)
    capped = true
    reasons.push(`触及今日经验上限（${state.settings.dailyPoolCap}），本次只结算 ${pool}`)
  }
  if (pool <= 0 && remaining <= 0) {
    reasons.push('今日经验已达上限，本次不计分')
  }

  const grants: Grant[] = def.grants
    .map((g) => ({
      kind: g.kind,
      key: g.key,
      points: round1(pool * g.ratio),
    }))
    .filter((g) => g.points > 0)

  return {
    ok: true,
    def,
    amount,
    dateKey,
    todayIndex: todayCount,
    diminish,
    streakBonus,
    rawPool,
    pool,
    capped,
    reasons,
    grants,
  }
}

export function previewActivity(
  state: AppState,
  activityKey: string,
  amount: number,
  now: Date = new Date(),
): ActivityComputation | { ok: false; error: string } {
  return computeActivity(state, activityKey, amount, now)
}

function applyGrants(
  character: Character,
  grants: Grant[],
): { character: Character; levelUps: LevelUp[] } {
  const core = { ...character.core }
  const skills = { ...character.skills }
  const levelUps: LevelUp[] = []

  for (const g of grants) {
    if (g.points <= 0) continue
    if (g.kind === 'core') {
      const key = g.key as CoreKey
      const res = addXp(core[key], g.points, 'core')
      core[key] = res.track
      for (const lv of res.levelUps) levelUps.push({ label: CORE_META[key].name, to: lv })
    } else {
      const key = g.key as SkillKey
      const res = addXp(skills[key], g.points, 'skill')
      skills[key] = res.track
      for (const lv of res.levelUps) levelUps.push({ label: SKILL_META[key].name, to: lv })
    }
  }

  return { character: { ...character, core, skills }, levelUps }
}

function applyCharXp(character: Character, pool: number): { character: Character; levelUps: LevelUp[] } {
  const res = addXp(
    { level: character.level, xp: character.xp, totalXp: character.totalXp },
    pool,
    'char',
  )
  return {
    character: {
      ...character,
      level: res.track.level,
      xp: res.track.xp,
      totalXp: res.track.totalXp,
    },
    levelUps: res.levelUps.map((lv) => ({ label: '综合等级', to: lv })),
  }
}

/** 更新连击天数（同一天多次结算不重复加） */
function updateStreak(character: Character, dateKey: string): Character {
  if (character.lastActiveDate === dateKey) return character
  const yesterday = shiftDateKey(dateKey, -1)
  const streakDays =
    character.lastActiveDate === yesterday ? character.streakDays + 1 : 1
  return { ...character, streakDays, lastActiveDate: dateKey }
}

export function settleActivity(
  state: AppState,
  input: { activityKey: string; amount: number; note?: string; now?: Date },
): ActivityOutcome {
  const character = state.character
  if (!character) return { ok: false, error: '还没有创建角色档案' }

  const now = input.now ?? new Date()
  const comp = computeActivity(state, input.activityKey, input.amount, now)
  if (!comp.ok) return comp

  const granted = applyGrants(character, comp.grants)
  const charXp = applyCharXp(granted.character, comp.pool)
  const withStreak = updateStreak(charXp.character, comp.dateKey)

  const entry: LogEntry = {
    id: uid(),
    at: now.toISOString(),
    dateKey: comp.dateKey,
    kind: 'activity',
    activityKey: comp.def.key,
    amount: comp.amount,
    unit: comp.def.unit,
    note: input.note?.trim() || undefined,
    todayIndex: comp.todayIndex,
    diminish: comp.diminish,
    streakBonus: comp.streakBonus,
    rawPool: comp.rawPool,
    pool: comp.pool,
    capped: comp.capped,
    capNote: comp.reasons.join('；') || undefined,
    grants: comp.grants,
    levelUps: [...granted.levelUps, ...charXp.levelUps],
    label: `${comp.def.name} ${comp.amount}${comp.def.unit}`,
  }

  const withLogs: AppState = {
    ...state,
    character: withStreak,
    logs: [...state.logs, entry],
  }
  const ach = applyAchievements(withLogs, now)
  if (ach.unlocked.length > 0) entry.achievements = ach.unlocked.map((a) => a.id)

  return {
    ok: true,
    state: ach.state,
    entry,
    computation: comp,
  }
}

/* ------------------------------ 任务结算 ------------------------------ */

export type TaskOutcome =
  | { ok: true; state: AppState; entry: LogEntry; task: Task }
  | { ok: false; error: string }

export function settleTask(state: AppState, taskId: string, now: Date = new Date()): TaskOutcome {
  const character = state.character
  if (!character) return { ok: false, error: '还没有创建角色档案' }

  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, error: '找不到该任务' }
  if (task.state !== 'pending') return { ok: false, error: '该任务不在待办状态' }

  const dateKey = dateKeyOf(now)
  const prospect = prospectiveStreak(character, dateKey)
  const streakBonus = streakMultiplier(prospect, state.settings.streakEnabled)

  let pool = round1(task.pool * streakBonus)
  const reasons: string[] = []
  if (streakBonus > 1) reasons.push(`连击加成 +${Math.round((streakBonus - 1) * 100)}%`)

  const remaining = Math.max(0, state.settings.taskDailyCap - spentPool(state, dateKey, 'task'))
  let capped = false
  if (pool > remaining) {
    pool = round1(remaining)
    capped = true
    reasons.push(`触及今日任务奖励上限（${state.settings.taskDailyCap}），本次只结算 ${pool}`)
  }

  const grants: Grant[] = task.grants
    .map((g) => ({ kind: g.kind, key: g.key, points: round1(pool * g.ratio) }))
    .filter((g) => g.points > 0)

  const granted = applyGrants(character, grants)
  const charXp = applyCharXp(granted.character, pool)
  const withStreak = updateStreak(charXp.character, dateKey)

  const entry: LogEntry = {
    id: uid(),
    at: now.toISOString(),
    dateKey,
    kind: 'task',
    taskId: task.id,
    taskTitle: task.title,
    todayIndex: 0,
    diminish: 1,
    streakBonus,
    rawPool: task.pool,
    pool,
    capped,
    capNote: reasons.join('；') || undefined,
    grants,
    levelUps: [...granted.levelUps, ...charXp.levelUps],
    label: `任务：${task.title}`,
  }

  const updatedTask: Task = { ...task, state: 'done', completedAt: now.toISOString() }

  const withLogs: AppState = {
    ...state,
    character: withStreak,
    logs: [...state.logs, entry],
    tasks: state.tasks.map((t) => (t.id === task.id ? updatedTask : t)),
  }
  const ach = applyAchievements(withLogs, now)
  if (ach.unlocked.length > 0) entry.achievements = ach.unlocked.map((a) => a.id)

  return {
    ok: true,
    state: ach.state,
    entry,
    task: updatedTask,
  }
}

/* ------------------------------ 新档构造 ------------------------------ */

export function emptyTracks<T extends string>(keys: T[]) {
  return keys.reduce(
    (acc, k) => {
      acc[k] = newTrack()
      return acc
    },
    {} as Record<T, ReturnType<typeof newTrack>>,
  )
}
