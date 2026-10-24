/**
 * 个人RPG系统 — 核心类型定义
 *
 * 设计原则（重要）：
 * 1. 面板数值只由「结算引擎」写入，UI 与 AI 都不能直接改数值。
 * 2. 每条记录（LogEntry）都保留结算时用到的系数与收益明细，可回放、可追溯、可调平衡。
 * 3. 存档是一个纯 JSON 对象，方便整包导出/导入。
 */

/** 四大主属性 */
export type CoreKey = 'wisdom' | 'charm' | 'health' | 'will'

/** 技能精通度（成长更快的次级维度） */
export type SkillKey =
  | 'english'
  | 'stamina'
  | 'focus'
  | 'speech'
  | 'tech'
  | 'social'
  | 'reading'
  | 'life'

/** 活动/任务分类 */
export type Category = 'body' | 'mind' | 'social' | 'life'

/** 任一可成长轨道：主属性或技能。xp 为当前等级内经验，totalXp 为累计。 */
export interface Track {
  level: number
  xp: number
  totalXp: number
}

/** 一笔收益：给某个主属性或技能加多少点 */
export interface Grant {
  kind: 'core' | 'skill'
  key: CoreKey | SkillKey
  points: number
}

/** 升级事件（用于结算反馈） */
export interface LevelUp {
  label: string
  to: number
}

/** 角色档案 + 面板 */
export interface Character {
  name: string
  age: number | null
  gender: string
  identity: string
  heightCm: number | null
  weightKg: number | null
  /** 目标，例如「减重 5kg」「一个月后过六级」 */
  goals: string[]
  core: Record<CoreKey, Track>
  skills: Record<SkillKey, Track>
  /** 综合等级（角色经验） */
  level: number
  xp: number
  totalXp: number
  /** 连续活跃天数 */
  streakDays: number
  /** 最后一次结算的本地日期 YYYY-MM-DD */
  lastActiveDate: string | null
  createdAt: string
}

/** 一条结算记录 */
export interface LogEntry {
  id: string
  at: string
  /** 本地日期 YYYY-MM-DD，用于每日上限与连击判定 */
  dateKey: string
  kind: 'activity' | 'task'
  activityKey?: string
  taskId?: string
  taskTitle?: string
  amount?: number
  unit?: string
  note?: string
  /** 该项活动当天的第几次（0 起），用于递减 */
  todayIndex: number
  /** 递减系数 */
  diminish: number
  /** 连击加成系数 */
  streakBonus: number
  /** 衰减前经验池 */
  rawPool: number
  /** 最终计入的经验池 */
  pool: number
  /** 是否被每日总上限截断 */
  capped: boolean
  capNote?: string
  grants: Grant[]
  levelUps: LevelUp[]
  /** 本次结算解锁的成就 id */
  achievements?: string[]
  /** 展示摘要，如「跑步 5 km」 */
  label: string
}

export type TaskState = 'pending' | 'done' | 'cancelled'
export type Difficulty = 1 | 2 | 3

/** 任务奖励定义：按比例分配经验池 */
export interface TaskGrantDef {
  kind: 'core' | 'skill'
  key: CoreKey | SkillKey
  ratio: number
}

export interface Task {
  id: string
  title: string
  detail?: string
  category: Category
  difficulty: Difficulty
  state: TaskState
  source: 'manual' | 'ai'
  createdAt: string
  dateKey: string
  dueDateKey?: string
  completedAt?: string
  /** 创建时固定的经验池，之后改平衡表不影响已存在的任务 */
  pool: number
  /** 创建时固定的分配比例 */
  grants: TaskGrantDef[]
}

/** AI 接入配置（只存在本机） */
export interface LlmSettings {
  /** OpenAI 兼容的 base URL，例如 https://api.deepseek.com */
  baseUrl: string
  apiKey: string
  model: string
  /**
   * 可选：代理地址。浏览器直连 LLM 接口可能被 CORS 挡住，
   * 填了代理后请求会发给它，由它转发。
   */
  proxyUrl: string
}

export interface Settings {
  /** 每日所有活动经验池上限 */
  dailyPoolCap: number
  /** 每日任务奖励经验池上限 */
  taskDailyCap: number
  /** 连击加成开关 */
  streakEnabled: boolean
  llm: LlmSettings
}

/** 成就等级 */
export type Tier = 'bronze' | 'silver' | 'gold'

/** 已解锁成就（只记录解锁时间，判定逻辑永远从存档复算） */
export interface AchievementRecord {
  id: string
  unlockedAt: string
}

/** 派发历史：用来避免反复推同一个任务、并让「换一个」有记忆 */
export interface DispatchRecord {
  id: string
  at: string
  title: string
  action: 'accepted' | 'rejected' | 'swapped'
  templateId?: string
}

export interface AppState {
  version: number
  character: Character | null
  logs: LogEntry[]
  tasks: Task[]
  settings: Settings
  dispatchHistory: DispatchRecord[]
  achievements: AchievementRecord[]
}

/** 结算结果：新状态 + 供 UI 播放反馈用的信息 */
export interface SettleResult {
  state: AppState
  entry: LogEntry
}
