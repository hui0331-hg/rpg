/**
 * 本地关键词解析（无 AI 兜底）。
 *
 * 为什么必须有：
 * 1. 没有 Key、断网、接口被 CORS 挡住时，记录功能不能瘫掉；
 * 2. 常见表达（跑了5公里、背了20个单词）用正则完全够用，还更快、零成本；
 * 3. 它是可单测的确定性逻辑，可以先验证「中文 → 结构化」这条链路。
 *
 * 局限也会写在 UI 上：复杂表达（"上午先跑了会儿，大概四五公里吧"）交给大模型更稳。
 */
import type { Category, Difficulty } from '../types'
import type { Intent, IntentLogItem, PendingTaskRef } from './intent'

interface Measure {
  value: number
  unit: 'distance' | 'minutes' | 'words' | 'pages' | 'times'
  raw: string
}

const MEASURE_RE = /(\d+(?:\.\d+)?)\s*(公里|千米|km|KM|米|分钟|min|小时|个|页|次|遍|组)/g

function toMeasures(text: string): Measure[] {
  const out: Measure[] = []
  MEASURE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MEASURE_RE.exec(text))) {
    const value = Number(m[1])
    const unitRaw = m[2]
    if (!Number.isFinite(value) || value <= 0) continue

    if (['公里', '千米', 'km', 'KM'].includes(unitRaw)) {
      out.push({ value, unit: 'distance', raw: `${value}${unitRaw}` })
    } else if (unitRaw === '米') {
      out.push({ value: value / 1000, unit: 'distance', raw: `${value}米` })
    } else if (unitRaw === '分钟' || unitRaw === 'min') {
      out.push({ value, unit: 'minutes', raw: `${value}分钟` })
    } else if (unitRaw === '小时') {
      out.push({ value: value * 60, unit: 'minutes', raw: `${value}小时` })
    } else if (unitRaw === '页') {
      out.push({ value, unit: 'pages', raw: `${value}页` })
    } else if (unitRaw === '个') {
      out.push({ value, unit: 'words', raw: `${value}个` })
    } else {
      out.push({ value, unit: 'times', raw: `${value}${unitRaw}` })
    }
  }
  return out
}

const TIME_VERBS: { re: RegExp; key: string }[] = [
  { re: /(?:自习|复习|学习|上课|写作业|看书)/, key: 'study' },
  { re: /(?:跑步|慢跑|跳绳|骑车|有氧|游泳|爬山|打球)/, key: 'cardio' },
  { re: /(?:健身|撸铁|力量|训练|深蹲|俯卧撑|仰卧起坐|练了)/, key: 'workout' },
  { re: /(?:编程|写代码|敲代码|刷题|练习|做项目)/, key: 'practice' },
  { re: /(?:拉伸|瑜伽|放松|热身)/, key: 'stretch' },
  { re: /(?:整理|收拾|打扫|清理|收纳)/, key: 'tidy' },
  { re: /(?:聊天|社交|聚会|见面|和朋友|约了)/, key: 'talk' },
  { re: /(?:演讲|汇报|展示|答辩|讲稿)/, key: 'express' },
]

/**
 * 任务标题的模糊匹配。
 *
 * 为什么不能只做 includes：用户会说「完成背单词任务」，
 * 而任务标题是「背 20 个英语单词」，整串包含判断会全部漏掉。
 *
 * 两种打分取最大值：
 * 1. 二字组命中率 —— 适合说法接近原文的情况；
 * 2. 字符集包含度 —— 适合「只说了标题里的关键词」的情况。
 *    因为数字/量词（20、个）会把二字组覆盖率稀释到很低，单靠 (1) 会漏判。
 */
const STOP_CHARS = new Set(['的', '了', '着', '个', '次', '我', '你', '他', '今', '天', '完', '成', '做'])

function charSet(s: string): Set<string> {
  const set = new Set<string>()
  for (const ch of s) {
    if (/^[\u4e00-\u9fa5]$/.test(ch) && !STOP_CHARS.has(ch)) set.add(ch)
  }
  return set
}

function scoreTaskMatch(text: string, title: string): number {
  const t = text.replace(/\s+/g, '')
  const clean = title.replace(/\s+/g, '')
  if (!clean) return 0
  if (t.includes(clean)) return 1

  // 1. 二字组命中率
  const grams: string[] = []
  for (let i = 0; i < clean.length - 1; i++) {
    const g = clean.slice(i, i + 2)
    if (!/^[\u4e00-\u9fa5]{2}$/.test(g) && !/\d/.test(g)) continue
    grams.push(g)
  }
  let hit = 0
  for (const g of grams) if (t.includes(g)) hit++
  const gramScore = grams.length > 0 ? hit / grams.length : 0

  // 2. 字符集包含度（忽略数字与量词）
  const a = charSet(clean)
  const b = charSet(t)
  let inter = 0
  for (const ch of a) if (b.has(ch)) inter++
  const containScore = Math.min(a.size, b.size) >= 2 && inter >= 2 ? inter / Math.min(a.size, b.size) : 0

  return Math.max(gramScore, containScore)
}

function bestTaskMatch(text: string, pending: PendingTaskRef[]): PendingTaskRef | null {
  let best: PendingTaskRef | null = null
  let bestScore = 0
  for (const t of pending) {
    const score = scoreTaskMatch(text, t.title)
    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }
  return bestScore >= 0.4 ? best : null
}

function classify(m: Measure, text: string): IntentLogItem | null {
  if (m.unit === 'distance') {
    if (/(?:跑步|慢跑|跑了|跑了趟|跑)/.test(text)) {
      return { activityKey: 'run', amount: m.value }
    }
    if (/(?:散步|走路|步行|走了|遛弯|遛狗)/.test(text)) {
      return { activityKey: 'walk', amount: m.value }
    }
    return null
  }

  if (m.unit === 'minutes') {
    for (const v of TIME_VERBS) {
      if (v.re.test(text)) return { activityKey: v.key, amount: m.value }
    }
    return null
  }

  if (m.unit === 'words') {
    if (/(?:单词|词汇|背单词)/.test(text)) {
      return { activityKey: 'words', amount: m.value }
    }
    return null
  }

  if (m.unit === 'pages') {
    return { activityKey: 'read', amount: m.value }
  }

  if (m.unit === 'times') {
    if (/(?:做饭|下厨|煮饭|做菜)/.test(text)) {
      return { activityKey: 'cook', amount: Math.min(m.value, 3) }
    }
    if (/(?:早睡|早起|按时睡|十一点前睡)/.test(text)) {
      return { activityKey: 'sleep', amount: 1 }
    }
    return null
  }

  return null
}

function guessRequestCategory(text: string, goals: string[]): Category {
  const corpus = `${text} ${goals.join(' ')}`
  if (/(?:减肥|减重|体重|跑步|健身|运动|瘦)/.test(corpus)) return 'body'
  if (/(?:英语|六级|四级|学习|考试|单词|看书|复习)/.test(corpus)) return 'mind'
  if (/(?:社交|朋友|表达|演讲|沟通)/.test(corpus)) return 'social'
  if (/(?:早起|作息|整理|房间|做饭)/.test(corpus)) return 'life'
  return 'mind'
}

const DEFAULT_TASK: Record<Category, { title: string; difficulty: Difficulty }> = {
  body: { title: '去操场慢跑 1 公里', difficulty: 1 },
  mind: { title: '记忆 20 个英语单词', difficulty: 2 },
  social: { title: '主动和一位朋友聊 10 分钟', difficulty: 1 },
  life: { title: '整理一次桌面，清空杂物', difficulty: 1 },
}

/** 不带数量的活动：「今天早睡了」「中午自己做饭」 */
const BARE_RULES: { re: RegExp; item: IntentLogItem }[] = [
  { re: /(?:早睡|早起|按时睡|十一点前睡|没熬夜)/, item: { activityKey: 'sleep', amount: 1 } },
  { re: /(?:做饭|下厨|煮饭|做菜)/, item: { activityKey: 'cook', amount: 1 } },
]

export function parseLocalIntent(
  text: string,
  pending: PendingTaskRef[] = [],
  goals: string[] = [],
): Intent {
  const raw = text.trim()
  if (!raw) return { type: 'chat', reply: '你想记点什么？' }

  // 1. 完成已有任务：文本里出现某个待办任务（允许说法不完全一致）
  const finished = /(?:完成|做完|搞定了|搞定|打卡|已经做完|弄完了)/.test(raw)
  if (finished && pending.length > 0) {
    const hit = bestTaskMatch(raw, pending)
    if (hit) {
      return {
        type: 'complete_task',
        taskId: hit.id,
        titleHint: hit.title,
        reply: `把「${hit.title}」标记为完成？`,
      }
    }
  }

  // 2. 记录活动
  const items: IntentLogItem[] = []
  const push = (item: IntentLogItem) => {
    const existing = items.find((i) => i.activityKey === item.activityKey)
    if (existing) {
      existing.amount = Math.max(existing.amount, item.amount)
    } else {
      items.push(item)
    }
  }

  for (const m of toMeasures(raw)) {
    const item = classify(m, raw)
    if (item) push(item)
  }

  // 没有数量但语义明确的（早睡 / 做饭）
  for (const r of BARE_RULES) {
    if (r.re.test(raw)) push({ ...r.item })
  }

  if (items.length > 0) {
    return {
      type: 'log',
      items,
      reply: `识别到 ${items.length} 项，确认后按规则结算。`,
    }
  }

  // 3. 请求发布任务
  if (/(?:发布|派发|安排|推荐|给我|来个|有什么).{0,6}任务|任务.{0,4}(?:呢|吧)/.test(raw)) {
    const category = guessRequestCategory(raw, goals)
    const preset = DEFAULT_TASK[category]
    return {
      type: 'request_task',
      title: preset.title,
      category,
      difficulty: preset.difficulty,
      reply: `给你安排一个${category === 'body' ? '身体' : category === 'mind' ? '头脑' : category === 'social' ? '社交' : '生活'}类任务。`,
    }
  }

  // 4. 兜底
  return {
    type: 'chat',
    reply:
      '这句话我还没解析出可记录的内容。试试更具体的说法，例如「跑了 5 公里」「背了 20 个单词」「学习 45 分钟」。',
  }
}
