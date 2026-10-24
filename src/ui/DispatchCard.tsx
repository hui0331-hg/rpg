import { useState } from 'react'
import { buildDispatchContext, proposeTask, shortlist, PHASE_LABEL, TASK_TEMPLATES, type Proposal } from '../core/dispatch'
import { buildMemoryDigest, memoryToPromptLines } from '../core/memory'
import { enhanceProposal } from '../ai/dispatchAi'
import { aiConfigured } from '../ai/resolve'
import { DIFFICULTY_LABEL, TASK_GRANT_BY_CATEGORY, TASK_POOL_BY_DIFFICULTY } from '../data/activities'
import { CATEGORY_META, targetColor, targetName } from '../data/meta'
import { fmt } from '../core/curve'
import { useGame } from '../state/store'

const HINT_CHIPS = [
  '我只有 10 分钟',
  '我等会儿要去上课',
  '今天有半小时空',
  '有点累，来点轻松的',
]

export function DispatchCard() {
  const { state, addTask, recordDispatch } = useGame()
  const [text, setText] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [excludeIds, setExcludeIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState<'ai' | 'local'>('local')
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState('')

  if (!state) return null

  const ctx = buildDispatchContext(state, new Date(), text)
  const hasAi = aiConfigured(state)

  const ask = async (exclude: string[]) => {
    setBusy(true)
    setError('')
    setWarning('')
    setAccepted('')
    try {
      const context = buildDispatchContext(state, new Date(), text)
      const all = shortlist(context, TASK_TEMPLATES.length).filter(
        (p) => !exclude.includes(p.templateId),
      )
      const candidates = all.slice(0, 5)
      if (candidates.length === 0) {
        setError('候选都换完了。你今天的任务池已经用尽，明天再来吧。')
        setProposal(null)
        return
      }
      const res = await enhanceProposal(
        state.settings.llm,
        context,
        candidates,
        text,
        memoryToPromptLines(buildMemoryDigest(state)),
      )
      setProposal(res.proposal)
      setSource(res.source)
      setWarning(res.warning ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : '派发失败')
    } finally {
      setBusy(false)
    }
  }

  const accept = () => {
    if (!proposal) return
    addTask({
      title: proposal.title,
      category: proposal.category,
      difficulty: proposal.difficulty,
      detail: proposal.reason,
      source: 'ai',
    })
    recordDispatch({
      title: proposal.title,
      action: 'accepted',
      templateId: proposal.templateId,
    })
    setAccepted(`已加入待办：${proposal.title}`)
    setProposal(null)
    setExcludeIds([])
    setText('')
  }

  const swap = async () => {
    if (!proposal) return
    recordDispatch({
      title: proposal.title,
      action: 'swapped',
      templateId: proposal.templateId,
    })
    const next = [...excludeIds, proposal.templateId]
    setExcludeIds(next)
    await ask(next)
  }

  const reject = () => {
    if (!proposal) return
    recordDispatch({
      title: proposal.title,
      action: 'rejected',
      templateId: proposal.templateId,
    })
    setAccepted('好，今天不推这个了。最近不会再重复推荐它。')
    setProposal(null)
    setExcludeIds([])
  }

  const reward = proposal
    ? TASK_GRANT_BY_CATEGORY[proposal.category].map((g) => ({
        name: targetName(g.kind, g.key),
        color: targetColor(g.kind, g.key),
        points: Math.round(TASK_POOL_BY_DIFFICULTY[proposal.difficulty] * g.ratio * 10) / 10,
      }))
    : []

  return (
    <div className="card dispatch-card">
      <div className="card-title">
        <span>让系统安排</span>
        <span className={`chip ${hasAi ? 'chip-gold' : ''}`}>{hasAi ? 'AI 辅助' : '规则推荐'}</span>
      </div>

      {/* 当前场景，透明展示引擎的依据 */}
      <div className="chip-row" style={{ marginBottom: 10 }}>
        <span className="chip">{PHASE_LABEL[ctx.phase]}</span>
        <span className="chip">
          今日经验 {fmt(ctx.todayPool)}/{ctx.dailyCap}
        </span>
        <span className="chip">
          完成率 {ctx.completionRate == null ? '暂无' : Math.round(ctx.completionRate * 100) + '%'}
        </span>
        {ctx.streakDays > 0 ? <span className="chip">连击 {ctx.streakDays}</span> : null}
        {ctx.pendingCount > 0 ? <span className="chip">待办 {ctx.pendingCount}</span> : null}
      </div>

      <input
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="现在什么情况？（可选）例如：只有 10 分钟 / 等会儿要上课"
        maxLength={60}
      />

      <div className="chip-row ai-examples" style={{ marginTop: 8 }}>
        {HINT_CHIPS.map((h) => (
          <button key={h} type="button" className="chip" onClick={() => setText(h)}>
            {h}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 10 }}
        onClick={() => ask(excludeIds)}
        disabled={busy}
      >
        {busy ? '正在安排…' : proposal ? '再安排一个' : '给我安排今天的事'}
      </button>

      {error ? <div className="warn-box">{error}</div> : null}
      {warning ? <div className="warn-box">{warning}</div> : null}
      {accepted ? <div className="hint-box ok-box">{accepted}</div> : null}

      {proposal ? (
        <div className="dispatch-proposal">
          <div className="chip-row" style={{ marginBottom: 8 }}>
            <span className="chip" style={{ color: CATEGORY_META[proposal.category].color }}>
              {CATEGORY_META[proposal.category].glyph} {CATEGORY_META[proposal.category].name}
            </span>
            <span className="chip">{DIFFICULTY_LABEL[proposal.difficulty]}</span>
            <span className="chip">约 {proposal.minutes} 分钟</span>
            <span className="chip">{source === 'ai' ? 'DeepSeek 挑选' : '规则挑选'}</span>
          </div>

          <div className="dispatch-title">{proposal.title}</div>
          <p className="dispatch-reason">{proposal.reason}</p>

          <div className="chip-row" style={{ marginBottom: 12 }}>
            {reward.map((r, i) => (
              <span
                key={i}
                className="chip"
                style={{ color: r.color, borderColor: `${r.color}55` }}
              >
                {r.name} +{fmt(r.points)}
              </span>
            ))}
          </div>

          <div className="dispatch-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={reject}>
              不要
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={swap} disabled={busy}>
              换一个
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={accept}>
              接受
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
