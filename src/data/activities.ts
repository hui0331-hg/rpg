import type { Category, CoreKey, SkillKey } from '../types'

/**
 * 活动定义表 —— M0 的「规则引擎」词库。
 *
 * M1 接入 AI 后，AI 只负责把你的一句话解析成 { activityKey, amount }，
 * 具体给多少分永远由这里 + 结算引擎决定，保证数值可复现、不随模型心情浮动。
 *
 * pool(amount) = 这次活动能产出的「经验池」点数。
 * grants[].ratio 是经验池的分配比例（比例各自独立，总和不必等于 1）。
 */

export interface ActivityGrantDef {
  kind: 'core' | 'skill'
  key: CoreKey | SkillKey
  ratio: number
}

export interface ActivityDef {
  key: string
  name: string
  glyph: string
  category: Category
  unit: string
  /** 输入步进 */
  step: number
  /** 单次输入量上限 */
  maxAmount: number
  /** 默认预填量 */
  defaultAmount: number
  pool: (amount: number) => number
  grants: ActivityGrantDef[]
  hint: string
}

const A = (def: ActivityDef) => def

export const ACTIVITIES: ActivityDef[] = [
  A({
    key: 'run',
    name: '跑步',
    glyph: '🏃',
    category: 'body',
    unit: 'km',
    step: 0.5,
    maxAmount: 30,
    defaultAmount: 3,
    pool: (km) => 0.8 * km,
    grants: [
      { kind: 'core', key: 'health', ratio: 0.5 },
      { kind: 'core', key: 'charm', ratio: 0.5 },
      { kind: 'skill', key: 'stamina', ratio: 0.6 },
    ],
    hint: '5km ≈ 健康+2 魅力+2',
  }),
  A({
    key: 'walk',
    name: '散步',
    glyph: '🚶',
    category: 'body',
    unit: 'km',
    step: 0.5,
    maxAmount: 15,
    defaultAmount: 2,
    pool: (km) => 0.35 * km,
    grants: [
      { kind: 'core', key: 'health', ratio: 0.8 },
      { kind: 'core', key: 'will', ratio: 0.2 },
    ],
    hint: '低强度但最容易坚持',
  }),
  A({
    key: 'cardio',
    name: '有氧运动',
    glyph: '🚴',
    category: 'body',
    unit: '分钟',
    step: 5,
    maxAmount: 180,
    defaultAmount: 30,
    pool: (min) => 0.1 * min,
    grants: [
      { kind: 'core', key: 'health', ratio: 0.6 },
      { kind: 'core', key: 'will', ratio: 0.2 },
      { kind: 'skill', key: 'stamina', ratio: 0.5 },
    ],
    hint: '跳绳/骑车/游泳，按时间记',
  }),
  A({
    key: 'workout',
    name: '力量训练',
    glyph: '🏋',
    category: 'body',
    unit: '分钟',
    step: 5,
    maxAmount: 180,
    defaultAmount: 30,
    pool: (min) => 0.12 * min,
    grants: [
      { kind: 'core', key: 'health', ratio: 0.6 },
      { kind: 'core', key: 'will', ratio: 0.4 },
      { kind: 'skill', key: 'stamina', ratio: 0.5 },
    ],
    hint: '30 分钟 ≈ 健康+1.1 意志+0.7',
  }),
  A({
    key: 'stretch',
    name: '拉伸 / 瑜伽',
    glyph: '🧘',
    category: 'body',
    unit: '分钟',
    step: 5,
    maxAmount: 90,
    defaultAmount: 15,
    pool: (min) => 0.08 * min,
    grants: [
      { kind: 'core', key: 'health', ratio: 0.5 },
      { kind: 'core', key: 'will', ratio: 0.3 },
    ],
    hint: '小投入，恢复向',
  }),
  A({
    key: 'study',
    name: '学习 / 自习',
    glyph: '📖',
    category: 'mind',
    unit: '分钟',
    step: 5,
    maxAmount: 240,
    defaultAmount: 45,
    pool: (min) => 0.15 * min,
    grants: [
      { kind: 'core', key: 'wisdom', ratio: 0.7 },
      { kind: 'skill', key: 'focus', ratio: 0.6 },
    ],
    hint: '45 分钟 ≈ 智慧+2.4',
  }),
  A({
    key: 'words',
    name: '背单词',
    glyph: '🔤',
    category: 'mind',
    unit: '个',
    step: 5,
    maxAmount: 200,
    defaultAmount: 20,
    pool: (n) => 0.04 * n,
    grants: [
      { kind: 'core', key: 'wisdom', ratio: 0.3 },
      { kind: 'skill', key: 'english', ratio: 0.8 },
    ],
    hint: '20 个 ≈ 英语技能+0.6',
  }),
  A({
    key: 'read',
    name: '阅读',
    glyph: '📚',
    category: 'mind',
    unit: '页',
    step: 5,
    maxAmount: 300,
    defaultAmount: 20,
    pool: (p) => 0.12 * p,
    grants: [
      { kind: 'core', key: 'wisdom', ratio: 0.6 },
      { kind: 'skill', key: 'reading', ratio: 0.7 },
    ],
    hint: '20 页 ≈ 智慧+1.4',
  }),
  A({
    key: 'practice',
    name: '编程 / 实操',
    glyph: '⌨',
    category: 'mind',
    unit: '分钟',
    step: 5,
    maxAmount: 240,
    defaultAmount: 30,
    pool: (min) => 0.15 * min,
    grants: [
      { kind: 'core', key: 'wisdom', ratio: 0.4 },
      { kind: 'skill', key: 'tech', ratio: 0.8 },
      { kind: 'skill', key: 'focus', ratio: 0.3 },
    ],
    hint: '动手的部分才算分',
  }),
  A({
    key: 'talk',
    name: '社交 / 聊天',
    glyph: '☍',
    category: 'social',
    unit: '分钟',
    step: 5,
    maxAmount: 180,
    defaultAmount: 20,
    pool: (min) => 0.1 * min,
    grants: [
      { kind: 'core', key: 'charm', ratio: 0.7 },
      { kind: 'skill', key: 'social', ratio: 0.6 },
    ],
    hint: '主动经营关系才计数',
  }),
  A({
    key: 'express',
    name: '演讲 / 展示',
    glyph: '🎤',
    category: 'social',
    unit: '分钟',
    step: 5,
    maxAmount: 120,
    defaultAmount: 10,
    pool: (min) => 0.2 * min,
    grants: [
      { kind: 'core', key: 'charm', ratio: 0.5 },
      { kind: 'skill', key: 'speech', ratio: 0.8 },
    ],
    hint: '小场面也算，别只算正式汇报',
  }),
  A({
    key: 'tidy',
    name: '整理环境',
    glyph: '🧹',
    category: 'life',
    unit: '分钟',
    step: 5,
    maxAmount: 120,
    defaultAmount: 15,
    pool: (min) => 0.1 * min,
    grants: [
      { kind: 'core', key: 'will', ratio: 0.5 },
      { kind: 'skill', key: 'life', ratio: 0.6 },
    ],
    hint: '桌面、房间、文件都算',
  }),
  A({
    key: 'cook',
    name: '自己做饭',
    glyph: '🍳',
    category: 'life',
    unit: '次',
    step: 1,
    maxAmount: 3,
    defaultAmount: 1,
    pool: (n) => 1.5 * n,
    grants: [
      { kind: 'skill', key: 'life', ratio: 0.7 },
      { kind: 'core', key: 'health', ratio: 0.3 },
    ],
    hint: '一次健康的一餐',
  }),
  A({
    key: 'sleep',
    name: '早睡早起',
    glyph: '🌙',
    category: 'life',
    unit: '次',
    step: 1,
    maxAmount: 1,
    defaultAmount: 1,
    pool: (n) => 2 * n,
    grants: [
      { kind: 'core', key: 'health', ratio: 0.4 },
      { kind: 'core', key: 'will', ratio: 0.6 },
    ],
    hint: '一天只能记一次',
  }),
]

export const ACTIVITY_MAP: Record<string, ActivityDef> = ACTIVITIES.reduce(
  (acc, a) => {
    acc[a.key] = a
    return acc
  },
  {} as Record<string, ActivityDef>,
)

export function activityByKey(key: string): ActivityDef | undefined {
  return ACTIVITY_MAP[key]
}

/** 任务奖励：按难度给经验池，再按分类分配 */
export const TASK_POOL_BY_DIFFICULTY: Record<1 | 2 | 3, number> = {
  1: 3,
  2: 6,
  3: 10,
}

export const TASK_GRANT_BY_CATEGORY: Record<
  Category,
  { kind: 'core' | 'skill'; key: CoreKey | SkillKey; ratio: number }[]
> = {
  body: [
    { kind: 'core', key: 'health', ratio: 0.5 },
    { kind: 'core', key: 'will', ratio: 0.3 },
    { kind: 'skill', key: 'stamina', ratio: 0.4 },
  ],
  mind: [
    { kind: 'core', key: 'wisdom', ratio: 0.6 },
    { kind: 'skill', key: 'focus', ratio: 0.4 },
  ],
  social: [
    { kind: 'core', key: 'charm', ratio: 0.6 },
    { kind: 'skill', key: 'social', ratio: 0.4 },
  ],
  life: [
    { kind: 'core', key: 'will', ratio: 0.5 },
    { kind: 'skill', key: 'life', ratio: 0.4 },
  ],
}

export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: '简单',
  2: '适中',
  3: '挑战',
}
