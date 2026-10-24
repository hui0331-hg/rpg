/**
 * 任务派发引擎（M2）—— 确定性部分。
 *
 * 设计原则：**AI 不决定奖励，也不凭空编任务**。
 *   1. 这里先用纯规则算出「现在适合做什么」的候选池（分数可解释）；
 *   2. AI 只能在这个候选池里挑一个、改写标题、润色理由；
 *   3. 奖励仍然由 category + difficulty 查表得到。
 *
 * 这样一来：AI 挂了功能照常；AI 胡说也只会胡说标题，不会破坏数值平衡。
 */
import { TASK_GRANT_BY_CATEGORY, TASK_POOL_BY_DIFFICULTY } from '../data/activities'
import { CORE_META, CORE_ORDER, SKILL_META } from '../data/meta'
import { dateKeyOf, shiftDateKey } from './engine'
import type { AppState, Category, CoreKey, Difficulty, SkillKey } from '../types'

export type Phase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'

export const PHASE_LABEL: Record<Phase, string> = {
  dawn: '凌晨',
  morning: '上午',
  noon: '中午',
  afternoon: '下午',
  evening: '傍晚',
  night: '深夜',
}

export function phaseOf(d: Date): Phase {
  const h = d.getHours()
  if (h < 5) return 'dawn'
  if (h < 11) return 'morning'
  if (h < 14) return 'noon'
  if (h < 18) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

/* ------------------------------ 模板池 ------------------------------ */

export type TimeTag = 'quick' | 'normal' | 'deep'

export interface TaskTemplate {
  id: string
  title: string
  category: Category
  difficulty: Difficulty
  /** 预估耗时（分钟），也用于「你现在有多少时间」的匹配 */
  minutes: number
  tag: TimeTag
  /** 适合的时段，空数组=随时 */
  phases: Phase[]
  /** 主要加成方向，用于匹配能力短板 */
  boosts: (CoreKey | SkillKey)[]
  /** 命中用户目标的关键词 */
  goalHint?: RegExp
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  // ---- quick：碎片时间也能完成 ----
  {
    id: 'q-words10',
    title: '记忆 10 个英语单词',
    category: 'mind',
    difficulty: 1,
    minutes: 8,
    tag: 'quick',
    phases: [],
    boosts: ['english', 'wisdom'],
    goalHint: /英语|六级|四级|单词|考研/,
  },
  {
    id: 'q-stretch',
    title: '拉伸 5 分钟，活动一下肩颈',
    category: 'body',
    difficulty: 1,
    minutes: 5,
    tag: 'quick',
    phases: [],
    boosts: ['health'],
  },
  {
    id: 'q-tidy',
    title: '整理桌面，清掉 5 件杂物',
    category: 'life',
    difficulty: 1,
    minutes: 8,
    tag: 'quick',
    phases: [],
    boosts: ['will', 'life'],
  },
  {
    id: 'q-msg',
    title: '主动给一位朋友发条消息',
    category: 'social',
    difficulty: 1,
    minutes: 5,
    tag: 'quick',
    phases: [],
    boosts: ['charm', 'social'],
  },
  {
    id: 'q-review',
    title: '复述一遍今天学到的一个概念',
    category: 'mind',
    difficulty: 1,
    minutes: 10,
    tag: 'quick',
    phases: [],
    boosts: ['wisdom', 'focus'],
  },
  {
    id: 'q-water',
    title: '喝够一杯水，站起来走 3 分钟',
    category: 'life',
    difficulty: 1,
    minutes: 4,
    tag: 'quick',
    phases: [],
    boosts: ['health'],
  },

  // ---- normal：半小时左右 ----
  {
    id: 'n-study30',
    title: '专注学习 30 分钟（手机静音）',
    category: 'mind',
    difficulty: 2,
    minutes: 30,
    tag: 'normal',
    phases: [],
    boosts: ['wisdom', 'focus'],
  },
  {
    id: 'n-read',
    title: '阅读 20 页书',
    category: 'mind',
    difficulty: 2,
    minutes: 30,
    tag: 'normal',
    phases: [],
    boosts: ['wisdom', 'reading'],
  },
  {
    id: 'n-walk',
    title: '散步 2 公里',
    category: 'body',
    difficulty: 1,
    minutes: 25,
    tag: 'normal',
    phases: ['morning', 'noon', 'afternoon', 'evening'],
    boosts: ['health', 'will'],
  },
  {
    id: 'n-strength',
    title: '力量训练 20 分钟',
    category: 'body',
    difficulty: 2,
    minutes: 20,
    tag: 'normal',
    phases: ['afternoon', 'evening'],
    boosts: ['health', 'stamina'],
  },
  {
    id: 'n-code',
    title: '写 30 分钟代码 / 动手练一段',
    category: 'mind',
    difficulty: 2,
    minutes: 30,
    tag: 'normal',
    phases: [],
    boosts: ['wisdom', 'tech'],
  },
  {
    id: 'n-tidyroom',
    title: '把房间的一个角落收拾干净',
    category: 'life',
    difficulty: 2,
    minutes: 20,
    tag: 'normal',
    phases: [],
    boosts: ['will', 'life'],
  },
  {
    id: 'n-talk',
    title: '和一个人认真聊 15 分钟',
    category: 'social',
    difficulty: 2,
    minutes: 15,
    tag: 'normal',
    phases: [],
    boosts: ['charm', 'social'],
  },

  // ---- deep：需要整块时间 ----
  {
    id: 'd-run3',
    title: '跑步 3 公里',
    category: 'body',
    difficulty: 3,
    minutes: 30,
    tag: 'deep',
    phases: ['morning', 'afternoon', 'evening'],
    boosts: ['health', 'charm', 'stamina'],
    goalHint: /减重|减肥|跑步|运动|体重/,
  },
  {
    id: 'd-focus60',
    title: '深度专注 60 分钟，只做一件事',
    category: 'mind',
    difficulty: 3,
    minutes: 60,
    tag: 'deep',
    phases: [],
    boosts: ['wisdom', 'focus'],
  },
  {
    id: 'd-english40',
    title: '英语精听 / 精读 40 分钟',
    category: 'mind',
    difficulty: 3,
    minutes: 40,
    tag: 'deep',
    phases: [],
    boosts: ['english', 'wisdom'],
    goalHint: /英语|六级|四级|雅思|托福/,
  },
  {
    id: 'd-project',
    title: '推进 60 分钟自己的项目',
    category: 'mind',
    difficulty: 3,
    minutes: 60,
    tag: 'deep',
    phases: [],
    boosts: ['tech', 'focus'],
  },
]

export const TEMPLATE_MAP: Record<string, TaskTemplate> = TASK_TEMPLATES.reduce(
  (acc, t) => {
    acc[t.id] = t
    return acc
  },
  {} as Record<string, TaskTemplate>,
)

/* ------------------------------ 上下文 ------------------------------ */

export interface DispatchContext {
  now: Date
  dateKey: string
  phase: Phase
  /** 用户告知的可用时间（分钟）；null = 未知 */
  minutesAvailable: number | null
  todayPool: number
  dailyCap: number
  /** 今天已经记录过的活动 key */
  todayActivities: string[]
  /** 今天已经完成的任务数 */
  todayDoneTasks: number
  pendingCount: number
  streakDays: number
  /** 近 7 天任务完成率 0~1；无数据时为 null */
  completionRate: number | null
  /** 近 7 天增长最少的主属性（短板） */
  weakest: CoreKey | null
  goals: string[]
  /** 近期被拒绝 / 换掉的任务标题 */
  rejectedTitles: string[]
  /** 近期已完成/拒绝过的模板 id */
  recentTemplateIds: string[]
}

const LOW_RATE = 0.35
const HIGH_RATE = 0.7

function parseMinutesFromText(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|min)/i)
  if (m) {
    const v = Number(m[1])
    if (Number.isFinite(v) && v > 0) return Math.min(240, Math.round(v))
  }
  const h = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|h\b)/i)
  if (h) {
    const v = Number(h[1])
    if (Number.isFinite(v) && v > 0) return Math.min(240, Math.round(v * 60))
  }
  if (/半小时/.test(text)) return 30
  if (/一个多小时|一个半小时/.test(text)) return 90
  if (/没时间|来不及|赶时间|马上|立刻|快没|要走了|上课|开会|赶车|出门/.test(text)) {
    return 10
  }
  if (/有点时间|时间充足|有空|一整个下午|整块|充裕|不忙/.test(text)) {
    return 60
  }
  return null
}

export function buildDispatchContext(
  state: AppState,
  now: Date = new Date(),
  userText = '',
): DispatchContext {
  const dateKey = dateKeyOf(now)
  const ch = state.character
  const todayLogs = state.logs.filter((l) => l.dateKey === dateKey)
  const todayPool = todayLogs.reduce((s, l) => s + l.pool, 0)
  const todayActivities = todayLogs
    .filter((l) => l.kind === 'activity' && l.activityKey)
    .map((l) => l.activityKey as string)
  const todayDoneTasks = todayLogs.filter((l) => l.kind === 'task').length

  // 近 7 天「系统派发任务的完成率」：衡量推的任务是否合适
  const from = shiftDateKey(dateKey, -6)
  const windowTasks = state.tasks.filter((t) => t.dateKey >= from)
  const aiTasks = windowTasks.filter((t) => t.source === 'ai')
  const aiDone = aiTasks.filter((t) => t.state === 'done').length
  const completionRate = aiTasks.length === 0 ? null : aiDone / aiTasks.length

  // 近 7 天各主属性增长
  const gains = {} as Record<CoreKey, number>
  for (const k of CORE_ORDER) gains[k] = 0
  for (const log of state.logs) {
    if (log.dateKey < from) continue
    for (const g of log.grants) {
      if (g.kind === 'core') gains[g.key as CoreKey] = (gains[g.key as CoreKey] ?? 0) + g.points
    }
  }
  let weakest: CoreKey | null = null
  let lowest = Number.POSITIVE_INFINITY
  for (const k of CORE_ORDER) {
    if (gains[k] < lowest) {
      lowest = gains[k]
      weakest = k
    }
  }

  const recent = state.dispatchHistory.slice(-12)
  const rejectedTitles = recent.filter((r) => r.action !== 'accepted').map((r) => r.title)
  const recentTemplateIds = recent
    .map((r) => r.templateId)
    .filter((v): v is string => Boolean(v))

  return {
    now,
    dateKey,
    phase: phaseOf(now),
    minutesAvailable: userText ? parseMinutesFromText(userText) : null,
    todayPool,
    dailyCap: state.settings.dailyPoolCap,
    todayActivities,
    todayDoneTasks,
    pendingCount: state.tasks.filter((t) => t.state === 'pending').length,
    streakDays: ch?.streakDays ?? 0,
    completionRate,
    weakest,
    goals: ch?.goals ?? [],
    rejectedTitles,
    recentTemplateIds,
  }
}

/* ------------------------------ 打分 ------------------------------ */

export interface Proposal {
  templateId: string
  title: string
  category: Category
  difficulty: Difficulty
  minutes: number
  reason: string
  score: number
  /** 命中的加分项，给 UI 显示 */
  signals: string[]
}

function fitForBudget(tag: TimeTag, minutes: number | null): number {
  if (minutes == null) return 0
  if (minutes >= 45) return tag === 'deep' ? 1.2 : tag === 'normal' ? 0.4 : -0.6
  if (minutes >= 20) return tag === 'normal' ? 1.2 : tag === 'quick' ? 0.4 : -0.5
  // 不到 20 分钟：只推短任务
  return tag === 'quick' ? 1.6 : tag === 'normal' ? -0.8 : -1.6
}

function scoreTemplate(t: TaskTemplate, ctx: DispatchContext): { score: number; signals: string[] } {
  let score = 0
  const signals: string[] = []

  // 时间匹配（最重要：没时间时推长任务等于逼人放弃）
  const fit = fitForBudget(t.tag, ctx.minutesAvailable)
  score += fit
  if (ctx.minutesAvailable != null && fit >= 1.2) signals.push('时间刚好够')

  // 短板匹配
  if (ctx.weakest && t.boosts.includes(ctx.weakest)) {
    score += 1.5
    signals.push(`${CORE_META[ctx.weakest].name}最近涨得最慢`)
  }

  // 目标匹配
  if (t.goalHint && ctx.goals.some((g) => t.goalHint!.test(g))) {
    score += 1.2
    signals.push('对齐你的目标')
  }

  // 今天已经做过同类 → 收益会被递减，先别推
  const CATEGORY_ACTIVITIES: Record<Category, string[]> = {
    body: ['run', 'walk', 'workout', 'cardio', 'stretch'],
    mind: ['study', 'read', 'words', 'practice'],
    social: ['talk', 'express'],
    life: ['tidy', 'cook', 'sleep'],
  }
  const alreadyDidSimilar = ctx.todayActivities.some((a) =>
    CATEGORY_ACTIVITIES[t.category].includes(a),
  )
  if (alreadyDidSimilar) {
    score -= 1.0
    signals.push('同类今天已记录')
  }

  // 最近推过/拒过 → 不要重复烦人
  if (ctx.rejectedTitles.includes(t.title)) {
    score -= 2.5
  }
  if (ctx.recentTemplateIds.includes(t.id)) {
    score -= 0.8
  }

  // 时段匹配
  if (t.phases.length === 0) {
    score += 0.3
  } else if (t.phases.includes(ctx.phase)) {
    score += 0.6
    signals.push('适合现在这个时段')
  } else {
    score -= 0.9
  }

  // 完成率太低 → 降低难度；很高 → 可以加码
  const rate = ctx.completionRate
  if (rate != null) {
    if (rate < LOW_RATE) {
      score += t.tag === 'quick' ? 0.9 : t.tag === 'deep' ? -1.0 : 0
      if (t.tag === 'quick') signals.push('最近完成率偏低，先从简单的来')
    } else if (rate > HIGH_RATE) {
      score += t.tag === 'deep' ? 0.7 : 0
    }
  }

  // 今天额度已经用掉大半 → 别推重任务
  if (ctx.dailyCap > 0 && ctx.todayPool / ctx.dailyCap > 0.8) {
    score += t.tag === 'quick' ? 0.5 : t.tag === 'deep' ? -0.6 : 0
  }

  // 待办已经很多 → 少推一个
  if (ctx.pendingCount >= 3) score -= 0.5

  // 连击保护：断签边缘时优先短任务拉回连续
  if (ctx.streakDays === 0 && t.tag === 'quick') {
    score += 0.4
    signals.push('先接上连续记录')
  }

  return { score: Math.round(score * 100) / 100, signals }
}

function rewardSummary(t: TaskTemplate): string {
  const pool = TASK_POOL_BY_DIFFICULTY[t.difficulty]
  const parts = TASK_GRANT_BY_CATEGORY[t.category].map((g) => {
    const name =
      g.kind === 'core'
        ? CORE_META[g.key as CoreKey].name
        : SKILL_META[g.key as SkillKey].name
    return `${name}+${Math.round(pool * g.ratio * 10) / 10}`
  })
  return parts.join(' ')
}

function buildReason(t: TaskTemplate, ctx: DispatchContext, signals: string[]): string {
  const bits: string[] = []
  if (signals.length > 0) bits.push(...signals.slice(0, 2))

  if (ctx.minutesAvailable != null) {
    bits.push(`按你现在的 ${ctx.minutesAvailable} 分钟，这个大概要 ${t.minutes} 分钟`)
  }
  if (ctx.pendingCount > 0) {
    bits.push(`手上还有 ${ctx.pendingCount} 个待办，这个可以插空做`)
  }
  bits.push(`预估 ${t.minutes} 分钟 · 奖励池 ${TASK_POOL_BY_DIFFICULTY[t.difficulty]}`)
  return `${bits.join('；')}。`
}

export function shortlist(ctx: DispatchContext, n = 5): Proposal[] {
  return TASK_TEMPLATES.map((t) => {
    const { score, signals } = scoreTemplate(t, ctx)
    return {
      templateId: t.id,
      title: t.title,
      category: t.category,
      difficulty: t.difficulty,
      minutes: t.minutes,
      score,
      signals,
      reason: buildReason(t, ctx, signals),
    }
  })
    .sort((a, b) => b.score - a.score || a.templateId.localeCompare(b.templateId))
    .slice(0, n)
}

/** 选一个：排除掉已经换过的模板 */
export function proposeTask(
  ctx: DispatchContext,
  opts: { excludeTemplateIds?: string[] } = {},
): Proposal | null {
  const exclude = new Set(opts.excludeTemplateIds ?? [])
  const ranked = shortlist(ctx, TASK_TEMPLATES.length).filter((p) => !exclude.has(p.templateId))
  return ranked[0] ?? null
}

export { rewardSummary, parseMinutesFromText, scoreTemplate }
