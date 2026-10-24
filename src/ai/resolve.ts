/**
 * 意图解析总入口：优先大模型，失败/未配置则回落本地关键词解析。
 *
 * 无论走哪条路，产出的都只是「动作」；真正改数值的是 core/engine。
 */
import { computeActivity, dateKeyOf } from '../core/engine'
import type { ActivityComputation } from '../core/engine'
import { buildMemoryDigest, memoryToPromptLines } from '../core/memory'
import type { AppState, LogEntry } from '../types'
import { parseLocalIntent } from './fallback'
import {
  buildSystemPrompt,
  normalizeIntent,
  type PendingTaskRef,
  type ResolveResult,
} from './intent'
import { callLlm, extractJson } from './llm'

export function pendingRefs(state: AppState): PendingTaskRef[] {
  return state.tasks
    .filter((t) => t.state === 'pending')
    .map((t) => ({ id: t.id, title: t.title, category: t.category, difficulty: t.difficulty }))
}

export function aiConfigured(state: AppState): boolean {
  const cfg = state.settings.llm
  return Boolean(cfg.apiKey.trim() || cfg.proxyUrl.trim())
}

export async function resolveIntent(state: AppState, text: string): Promise<ResolveResult> {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, source: 'local', error: '先说一句话吧。' }

  const pending = pendingRefs(state)
  const goals = state.character?.goals ?? []
  const local = (warning?: string): ResolveResult => ({
    ok: true,
    source: 'local',
    warning,
    intent: parseLocalIntent(trimmed, pending, goals),
  })

  if (!aiConfigured(state)) return local()

  const cfg = state.settings.llm
  const memoryLines = memoryToPromptLines(buildMemoryDigest(state))
  const res = await callLlm(cfg, [
    { role: 'system', content: buildSystemPrompt(dateKeyOf(), pending, goals, memoryLines) },
    { role: 'user', content: trimmed },
  ])

  if (!res.ok) return local(`AI 不可用（${res.error}），已改用本地解析。`)

  const data = extractJson(res.content)
  if (!data) return local('模型返回的不是合法 JSON，已改用本地解析。')

  const normalized = normalizeIntent(data, pending)
  if (!normalized.ok) return local(`AI 结果异常（${normalized.error}），已改用本地解析。`)

  return { ok: true, source: 'ai', intent: normalized.intent, raw: res.content.slice(0, 400) }
}

/**
 * 预览一批动作的结算收益（不改真实状态）。
 *
 * 逐条顺序计算：后一条要看到前一条对「同类递减」和「每日上限」的占用，
 * 否则预览会和实际入账不一致 —— 用户看到 4 点、入账 2 点是最伤信任的 bug。
 * 做法是构造一条临时记录推进模拟状态，真实 store 不受影响。
 */
export function previewIntentItems(
  state: AppState,
  items: { activityKey: string; amount: number }[],
): ActivityComputation[] {
  const results: ActivityComputation[] = []
  let simulated = state

  for (const item of items) {
    const comp = computeActivity(simulated, item.activityKey, item.amount)
    if (!comp.ok) continue
    results.push(comp)

    const placeholder: LogEntry = {
      id: `preview-${results.length}`,
      at: new Date().toISOString(),
      dateKey: comp.dateKey,
      kind: 'activity',
      activityKey: comp.def.key,
      amount: comp.amount,
      unit: comp.def.unit,
      todayIndex: comp.todayIndex,
      diminish: comp.diminish,
      streakBonus: comp.streakBonus,
      rawPool: comp.rawPool,
      pool: comp.pool,
      capped: comp.capped,
      grants: comp.grants,
      levelUps: [],
      label: '',
    }
    simulated = { ...simulated, logs: [...simulated.logs, placeholder] }
  }

  return results
}
