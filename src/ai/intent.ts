/**
 * 意图解析 —— 把「我刚刚跑了 5 公里」变成可结算的结构化动作。
 *
 * 安全边界（很重要）：
 * AI 只允许输出「做什么、多少量、哪个任务」，**绝不允许直接输出属性数值**。
 * 数值永远由 core/engine 的确定性规则算出来，所以模型再怎么飘也改不了面板。
 */
import { ACTIVITY_MAP, ACTIVITIES } from '../data/activities'
import type { Category, Difficulty } from '../types'

export interface IntentLogItem {
  activityKey: string
  amount: number
  note?: string
}

export type Intent =
  | { type: 'log'; items: IntentLogItem[]; reply: string }
  | { type: 'complete_task'; taskId?: string; titleHint?: string; reply: string }
  | {
      type: 'request_task'
      title: string
      category: Category
      difficulty: Difficulty
      reply: string
    }
  | { type: 'chat'; reply: string }

export interface PendingTaskRef {
  id: string
  title: string
  category: Category
  difficulty: Difficulty
}

export interface ResolveResult {
  ok: boolean
  intent?: Intent
  /** ai = 走了大模型；local = 本地关键词解析 */
  source: 'ai' | 'local'
  /** 非致命提示，例如「AI 不可用，已改用本地解析」 */
  warning?: string
  error?: string
  raw?: string
}

const CATEGORIES: Category[] = ['body', 'mind', 'social', 'life']

export const AI_ACTIVITY_TABLE = ACTIVITIES.map(
  (a) => `${a.key}(中文名:${a.name}, 单位:${a.unit}, 单次上限:${a.maxAmount}, 默认:${a.defaultAmount})`,
).join('\n')

export function buildSystemPrompt(
  today: string,
  pending: PendingTaskRef[],
  goals: string[],
  memoryLines?: string,
): string {
  const taskLines =
    pending.length > 0
      ? pending.map((t) => `- id=${t.id} 标题=${t.title}`).join('\n')
      : '（当前没有待办任务）'

  const memoryBlock =
    memoryLines && memoryLines.trim()
      ? `\n对这个用户的长期了解（来自他的真实记录，可信）：\n${memoryLines}\n`
      : ''

  return `你是一个「个人 RPG 系统」的意图解析器。你的唯一职责是把用户的一句自然语言翻译成结构化 JSON。

今天是 ${today}。
用户的长期目标：${goals.length ? goals.join('；') : '（未填写）'}
${memoryBlock}
可用的活动类型（必须严格使用下面的 activity_key）：
${AI_ACTIVITY_TABLE}

用户的待办任务：
${taskLines}

只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块。字段：
{
  "intent": "log" | "complete_task" | "request_task" | "chat",
  "reply": "给用户看的一到两句中文（会显示在界面上）",
  "items": [{"activity_key": "run", "amount": 5, "note": "可选备注"}],
  "task_id": "完成已有任务时填它的 id",
  "task_title_hint": "完成已有任务但不确定 id 时填标题片段",
  "task": {"title": "新任务标题", "category": "body|mind|social|life", "difficulty": 1}
}

判断规则：
1. 用户描述自己做了某件可量化的事 → intent=log，填 items。amount 必须是数字，单位用该活动的单位（公里/分钟/个/页/次）。
2. 用户说完成了某个待办任务 → intent=complete_task。
3. 用户要求你安排/发布/推荐一个任务 → intent=request_task，并给出一个具体、今天就能做的任务。
4. 以上都不是（闲聊、提问、情绪） → intent=chat。
5. 绝对不要在 JSON 里给出任何「健康+2」「智慧加几」这类数值，数值由系统规则计算。
6. 一次可以做多件事（"跑了5公里还背了20个单词"）→ items 放两条。
7. 如果「长期了解」里显示某个属性长期停滞，可以在 reply 里点一句提醒，但不要超过一句，也不要说教。`
}

/* --------------------------- 校验与修正 --------------------------- */

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function clampAmount(activityKey: string, raw: number): number {
  const def = ACTIVITY_MAP[activityKey]
  if (!def) return raw
  const snapped = Math.round(raw / def.step) * def.step
  return Math.max(def.step, Math.min(def.maxAmount, snapped))
}

/**
 * 把模型返回的 JSON 变成可信的 Intent。
 * 所有字段都当作不可信数据校验：未知 activity_key 直接丢弃，数值一律夹取。
 */
export function normalizeIntent(
  data: unknown,
  pending: PendingTaskRef[],
): { ok: true; intent: Intent } | { ok: false; error: string } {
  if (!data || typeof data !== 'object') return { ok: false, error: '模型没有返回 JSON 对象' }
  const d = data as Record<string, unknown>
  const reply = typeof d.reply === 'string' && d.reply.trim() ? d.reply.trim() : ''
  const kind = typeof d.intent === 'string' ? d.intent : 'chat'

  if (kind === 'log') {
    const rawItems = Array.isArray(d.items) ? d.items : []
    const items: IntentLogItem[] = []
    for (const it of rawItems) {
      if (!it || typeof it !== 'object') continue
      const rec = it as Record<string, unknown>
      const key = typeof rec.activity_key === 'string' ? rec.activity_key : ''
      if (!ACTIVITY_MAP[key]) continue
      const amount = num(rec.amount)
      if (amount == null || amount <= 0) continue
      items.push({
        activityKey: key,
        amount: clampAmount(key, amount),
        note: typeof rec.note === 'string' && rec.note.trim() ? rec.note.trim() : undefined,
      })
    }
    if (items.length === 0) {
      return {
        ok: true,
        intent: { type: 'chat', reply: reply || '我没能从这句话里识别出可以记录的事，可以再说具体一点吗？' },
      }
    }
    return { ok: true, intent: { type: 'log', items, reply: reply || '已识别，请确认。' } }
  }

  if (kind === 'complete_task') {
    const id = typeof d.task_id === 'string' ? d.task_id : ''
    const hint = typeof d.task_title_hint === 'string' ? d.task_title_hint.trim() : ''
    const matched = pending.find((t) => t.id === id) ?? pending.find((t) => hint && t.title.includes(hint))
    if (matched) {
      return {
        ok: true,
        intent: {
          type: 'complete_task',
          taskId: matched.id,
          titleHint: matched.title,
          reply: reply || `把「${matched.title}」标记为完成？`,
        },
      }
    }
    return {
      ok: true,
      intent: {
        type: 'chat',
        reply: reply || '没有找到对应的待办任务。你可以在「任务」页手动勾选完成。',
      },
    }
  }

  if (kind === 'request_task') {
    const t = (d.task ?? {}) as Record<string, unknown>
    const title =
      typeof t.title === 'string' && t.title.trim()
        ? t.title.trim()
        : typeof d.task_title_hint === 'string' && d.task_title_hint.trim()
          ? d.task_title_hint.trim()
          : ''
    if (!title) {
      return { ok: false, error: '模型没有给出任务内容' }
    }
    const category = CATEGORIES.includes(t.category as Category)
      ? (t.category as Category)
      : 'mind'
    const diffNum = num(t.difficulty)
    const difficulty: Difficulty =
      diffNum === 1 || diffNum === 2 || diffNum === 3 ? (diffNum as Difficulty) : 2
    return {
      ok: true,
      intent: {
        type: 'request_task',
        title: title.slice(0, 60),
        category,
        difficulty,
        reply: reply || '给你安排了这个任务。',
      },
    }
  }

  return { ok: true, intent: { type: 'chat', reply: reply || '我在听。' } }
}
