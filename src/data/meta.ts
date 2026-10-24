import type { Category, CoreKey, SkillKey } from '../types'

export interface Meta {
  name: string
  glyph: string
  desc: string
  color: string
}

/** 四大主属性 */
export const CORE_META: Record<CoreKey, Meta> = {
  wisdom: {
    name: '智慧',
    glyph: '✦',
    desc: '学习、思考、解决问题。你处理未知的能力。',
    color: '#6ea8ff',
  },
  charm: {
    name: '魅力',
    glyph: '❖',
    desc: '外在状态与言行感染力。身体状态好，气场自然好。',
    color: '#ff7ba9',
  },
  health: {
    name: '健康',
    glyph: '✚',
    desc: '体能、作息、饮食构成的底子。一切长期主义的地基。',
    color: '#4ade80',
  },
  will: {
    name: '意志',
    glyph: '⚔',
    desc: '自律、坚持、抗干扰。决定你能把想法兑现多少。',
    color: '#f5b544',
  },
}

export const CORE_ORDER: CoreKey[] = ['wisdom', 'charm', 'health', 'will']

/** 技能精通度 */
export const SKILL_META: Record<SkillKey, Meta> = {
  english: { name: '英语', glyph: 'A', desc: '词汇、听说读写', color: '#8b9dff' },
  stamina: { name: '体能', glyph: '⏱', desc: '耐力与运动基础', color: '#5fdc9b' },
  focus: { name: '专注', glyph: '◎', desc: '深度工作的能力', color: '#7fd4ff' },
  speech: { name: '表达', glyph: '✎', desc: '说服与讲述', color: '#ffa6c9' },
  tech: { name: '技术', glyph: '⌘', desc: '编程与工具驾驭', color: '#9fb4ff' },
  social: { name: '社交', glyph: '☍', desc: '关系经营', color: '#ffc48a' },
  reading: { name: '阅读', glyph: '❦', desc: '输入与积累', color: '#a8e6a3' },
  life: { name: '生活', glyph: '⌂', desc: '自我照料与秩序', color: '#d6b47a' },
}

export const SKILL_ORDER: SkillKey[] = [
  'english',
  'stamina',
  'focus',
  'speech',
  'tech',
  'social',
  'reading',
  'life',
]

export const CATEGORY_META: Record<Category, { name: string; glyph: string; color: string }> = {
  body: { name: '身体', glyph: '♞', color: '#4ade80' },
  mind: { name: '头脑', glyph: '✦', color: '#6ea8ff' },
  social: { name: '社交', glyph: '☍', color: '#ff7ba9' },
  life: { name: '生活', glyph: '⌂', color: '#d6b47a' },
}

export const CATEGORY_ORDER: Category[] = ['body', 'mind', 'social', 'life']

/** 把 core/skill 的 key 映射成中文名，结算反馈与记录列表用 */
export function targetName(kind: 'core' | 'skill', key: string): string {
  if (kind === 'core') {
    return CORE_META[key as CoreKey]?.name ?? key
  }
  return SKILL_META[key as SkillKey]?.name ?? key
}

export function targetColor(kind: 'core' | 'skill', key: string): string {
  if (kind === 'core') {
    return CORE_META[key as CoreKey]?.color ?? '#8b9dae'
  }
  return SKILL_META[key as SkillKey]?.color ?? '#8b9dae'
}
