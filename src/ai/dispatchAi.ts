/**
 * 派发的 AI 增强层。
 *
 * 职责收得很窄：**只让模型在确定性候选池里挑一个，并改写标题/理由**。
 * 它拿不到「给多少分」的权力，候选池外的东西一律拒绝。
 */
import type { LlmSettings } from '../types'
import { PHASE_LABEL, type DispatchContext, type Proposal } from '../core/dispatch'
import { callLlm, extractJson } from './llm'

export interface EnhanceResult {
  proposal: Proposal
  source: 'ai' | 'local'
  warning?: string
}

function buildPrompt(
  ctx: DispatchContext,
  candidates: Proposal[],
  userText: string,
  memoryLines: string,
): string {
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. id=${c.templateId} | 标题=${c.title} | 分类=${c.category} | 难度=${c.difficulty} | 约${c.minutes}分钟`,
    )
    .join('\n')

  const memoryBlock = memoryLines.trim()
    ? `\n对这个用户的长期了解（来自真实记录，可信）：\n${memoryLines}\n`
    : ''

  return `你是个人 RPG 系统的任务派发助手。用户现在需要一个今天能完成的任务。

当前情况：
- 时间：${PHASE_LABEL[ctx.phase]}
- 用户说的：${userText || '（没有额外说明）'}
- 今天已获得经验池：${ctx.todayPool} / ${ctx.dailyCap}
- 今天已完成任务数：${ctx.todayDoneTasks}
- 手上未完成任务数：${ctx.pendingCount}
- 连续记录天数：${ctx.streakDays}
- 近 7 天派发任务完成率：${ctx.completionRate == null ? '暂无数据' : Math.round(ctx.completionRate * 100) + '%'}
- 用户目标：${ctx.goals.length ? ctx.goals.join('；') : '（未填写）'}
- 用户可用时间：${ctx.minutesAvailable == null ? '未知' : ctx.minutesAvailable + ' 分钟'}
${memoryBlock}
候选任务（只能从里面挑，不能自己发明）：
${list}

只输出 JSON：
{
  "candidate_id": "候选里的 id",
  "title": "改写后的标题，不超过 20 个汉字，要具体可执行",
  "reason": "一到两句话，说明为什么现在推这个，语气自然，不要说教"
}

硬性要求：
1. candidate_id 必须来自上面的候选；
2. 用户可用时间不足时，不要选耗时超过它 1.5 倍的候选项；
3. 语气像一个了解他的朋友，不要用"执行""赋能"这类词。`
}

export async function enhanceProposal(
  cfg: LlmSettings,
  ctx: DispatchContext,
  candidates: Proposal[],
  userText: string,
  memoryLines = '',
): Promise<EnhanceResult> {
  const fallback = candidates[0]
  if (!fallback) throw new Error('候选池为空')
  const configured = Boolean(cfg.apiKey.trim() || cfg.proxyUrl.trim())
  if (!configured || candidates.length === 0) {
    return { proposal: fallback, source: 'local' }
  }

  const res = await callLlm(cfg, [
    { role: 'system', content: '你是任务派发助手，只输出 JSON。' },
    { role: 'user', content: buildPrompt(ctx, candidates, userText, memoryLines) },
  ])
  if (!res.ok) {
    return { proposal: fallback, source: 'local', warning: `AI 不可用（${res.error}），已用规则推荐。` }
  }

  const data = extractJson(res.content)
  if (!data || typeof data !== 'object') {
    return { proposal: fallback, source: 'local', warning: 'AI 返回不是合法 JSON，已用规则推荐。' }
  }

  const d = data as Record<string, unknown>
  const id = typeof d.candidate_id === 'string' ? d.candidate_id : ''
  const chosen = candidates.find((c) => c.templateId === id)
  if (!chosen) {
    return {
      proposal: fallback,
      source: 'local',
      warning: 'AI 选了候选池之外的任务，已忽略并用规则推荐。',
    }
  }

  const titleOverride =
    typeof d.title === 'string' && d.title.trim().length > 0 && d.title.trim().length <= 40
      ? d.title.trim()
      : null
  const reason =
    typeof d.reason === 'string' && d.reason.trim().length > 0 && d.reason.trim().length <= 160
      ? d.reason.trim()
      : chosen.reason

  // 时间硬约束：AI 挑的必须真的放得进用户给的时间
  if (ctx.minutesAvailable != null && chosen.minutes > ctx.minutesAvailable * 1.5) {
    return {
      proposal: fallback,
      source: 'local',
      warning: 'AI 选的任务超出你的可用时间，已改用更短的推荐。',
    }
  }

  return {
    proposal: { ...chosen, title: titleOverride ?? chosen.title, reason },
    source: 'ai',
  }
}
