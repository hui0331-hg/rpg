import type { Tier } from '../types'

/**
 * 成就定义。
 *
 * 设计约束：成就只能「从存档算出来」，不能由 AI 授予、也不能手工写入。
 * 这样它才可信 —— 你打开历史记录就能复算出每一个徽章是凭什么拿的。
 */
export type { Tier }

/** 评估一个存档的派生数值，一次算好喂给所有成就，避免每个成就都遍历日志 */
export interface AchievementCtx {
  totalLogs: number
  logDays: number
  totalXp: number
  longestStreak: number
  currentStreak: number
  maxCoreLevel: number
  minCoreLevel: number
  charLevel: number
  tasksDone: number
  runKm: number
  wordsCount: number
  studyMinutes: number
  sleepCount: number
}

export interface AchievementDef {
  id: string
  name: string
  desc: string
  glyph: string
  tier: Tier
  /** 达成线 */
  target: number
  /** 从上下文里取值，用于判定与进度显示 */
  value: (ctx: AchievementCtx) => number
}

export const TIER_LABEL: Record<Tier, string> = {
  bronze: '铜',
  silver: '银',
  gold: '金',
}

export const TIER_COLOR: Record<Tier, string> = {
  bronze: '#c98a5b',
  silver: '#c3ccd9',
  gold: '#e8c87a',
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-log',
    name: '初次落笔',
    desc: '记录第一件事',
    glyph: '✎',
    tier: 'bronze',
    target: 1,
    value: (c) => c.totalLogs,
  },
  {
    id: 'first-task',
    name: '首个任务',
    desc: '完成第一个任务',
    glyph: '✓',
    tier: 'bronze',
    target: 1,
    value: (c) => c.tasksDone,
  },
  {
    id: 'streak-3',
    name: '三日之约',
    desc: '连续记录 3 天',
    glyph: '🔥',
    tier: 'bronze',
    target: 3,
    value: (c) => c.longestStreak,
  },
  {
    id: 'streak-7',
    name: '一周不断',
    desc: '连续记录 7 天',
    glyph: '📅',
    tier: 'silver',
    target: 7,
    value: (c) => c.longestStreak,
  },
  {
    id: 'streak-30',
    name: '月度铁人',
    desc: '连续记录 30 天',
    glyph: '🗿',
    tier: 'gold',
    target: 30,
    value: (c) => c.longestStreak,
  },
  {
    id: 'xp-100',
    name: '百点积累',
    desc: '累计获得 100 点经验池',
    glyph: '✦',
    tier: 'bronze',
    target: 100,
    value: (c) => c.totalXp,
  },
  {
    id: 'xp-1000',
    name: '千点之路',
    desc: '累计获得 1000 点经验池',
    glyph: '✧',
    tier: 'gold',
    target: 1000,
    value: (c) => c.totalXp,
  },
  {
    id: 'level-5',
    name: '渐入佳境',
    desc: '综合等级达到 Lv.5',
    glyph: '⬆',
    tier: 'silver',
    target: 5,
    value: (c) => c.charLevel,
  },
  {
    id: 'run-20',
    name: '跑者',
    desc: '累计跑步 20 公里',
    glyph: '🏃',
    tier: 'bronze',
    target: 20,
    value: (c) => c.runKm,
  },
  {
    id: 'run-100',
    name: '长跑者',
    desc: '累计跑步 100 公里',
    glyph: '🏅',
    tier: 'gold',
    target: 100,
    value: (c) => c.runKm,
  },
  {
    id: 'words-500',
    name: '词库扩张',
    desc: '累计记忆 500 个单词',
    glyph: '📖',
    tier: 'silver',
    target: 500,
    value: (c) => c.wordsCount,
  },
  {
    id: 'study-600',
    name: '十小时',
    desc: '累计专注学习 600 分钟',
    glyph: '⏳',
    tier: 'silver',
    target: 600,
    value: (c) => c.studyMinutes,
  },
  {
    id: 'core-3',
    name: '四项皆通',
    desc: '四大主属性全部达到 Lv.3',
    glyph: '❖',
    tier: 'silver',
    target: 3,
    value: (c) => c.minCoreLevel,
  },
  {
    id: 'core-5',
    name: '全能发展',
    desc: '四大主属性全部达到 Lv.5',
    glyph: '✵',
    tier: 'gold',
    target: 5,
    value: (c) => c.minCoreLevel,
  },
  {
    id: 'tasks-10',
    name: '执行者',
    desc: '累计完成 10 个任务',
    glyph: '☑',
    tier: 'silver',
    target: 10,
    value: (c) => c.tasksDone,
  },
  {
    id: 'sleep-10',
    name: '作息守卫',
    desc: '记录 10 次早睡早起',
    glyph: '🌙',
    tier: 'bronze',
    target: 10,
    value: (c) => c.sleepCount,
  },
]

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = ACHIEVEMENTS.reduce(
  (acc, a) => {
    acc[a.id] = a
    return acc
  },
  {} as Record<string, AchievementDef>,
)
