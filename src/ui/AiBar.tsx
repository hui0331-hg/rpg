import { useState } from 'react'
import { aiConfigured, previewIntentItems, resolveIntent } from '../ai/resolve'
import type { Intent, ResolveResult } from '../ai/intent'
import { CATEGORY_META } from '../data/meta'
import { DIFFICULTY_LABEL } from '../data/activities'
import { fmt } from '../core/curve'
import { useGame } from '../state/store'
import { GainChips } from './components'

const EXAMPLES = ['我刚刚跑了 5 公里', '背了 20 个英语单词', '学习 45 分钟', '完成背单词任务']

export function AiBar() {
  const { state, logActivity, completeTask, addTask } = useGame()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ResolveResult | null>(null)
  const [applied, setApplied] = useState('')
  const [error, setError] = useState('')

  if (!state) return null
  const hasAi = aiConfigured(state)

  const run = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    setError('')
    setApplied('')
    setResult(null)
    try {
      const res = await resolveIntent(state, text)
      setResult(res)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setResult(null)
    setError('')
    setText('')
  }

  const applyLog = (intent: Extract<Intent, { type: 'log' }>) => {
    const summaries: string[] = []
    for (const item of intent.items) {
      const outcome = logActivity(item.activityKey, item.amount, item.note)
      if (!outcome.ok) {
        setError(outcome.error)
        return
      }
      const gains = outcome.entry.grants.map((g) => `${g.key}+${fmt(g.points)}`).join(' ')
      summaries.push(`${outcome.entry.label}${outcome.entry.pool > 0 ? `（${gains}）` : '（未计分）'}`)
    }
    setApplied(`已入账：${summaries.join('；')}`)
    setResult(null)
    setText('')
  }

  const applyComplete = (intent: Extract<Intent, { type: 'complete_task' }>) => {
    if (!intent.taskId) {
      setError('没有匹配到具体任务')
      return
    }
    const outcome = completeTask(intent.taskId)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    setApplied(`任务已完成：${outcome.entry.taskTitle}（奖励池 +${fmt(outcome.entry.pool)}）`)
    setResult(null)
    setText('')
  }

  const applyRequest = (intent: Extract<Intent, { type: 'request_task' }>) => {
    addTask({
      title: intent.title,
      category: intent.category,
      difficulty: intent.difficulty,
      source: 'ai',
    })
    setApplied(`已创建任务：${intent.title}`)
    setResult(null)
    setText('')
  }

  const intent = result?.intent
  const previews =
    intent?.type === 'log' ? previewIntentItems(state, intent.items) : []

  return (
    <div className="card ai-card">
      <div className="card-title">
        <span>说一句话，系统来记</span>
        <span className={`chip ${hasAi ? 'chip-gold' : ''}`}>
          {hasAi ? '已接入 AI' : '本地解析'}
        </span>
      </div>

      <textarea
        className="textarea ai-input"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError('')
        }}
        placeholder="例如：我刚刚跑了 5km"
        rows={2}
        maxLength={300}
      />

      <div className="chip-row ai-examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="chip" onClick={() => setText(ex)}>
            {ex}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 10 }}
        onClick={run}
        disabled={loading || !text.trim()}
      >
        {loading ? '解析中…' : '交给系统解析'}
      </button>

      {!hasAi ? (
        <div className="hint-box" style={{ marginTop: 10, marginBottom: 0 }}>
          还没配置 AI，当前用本地关键词解析（够用但只认常见说法）。在「档案 → AI 接入」里填
          DeepSeek Key 即可解锁完整理解能力。
        </div>
      ) : null}

      {error ? <div className="warn-box">{error}</div> : null}
      {applied ? <div className="hint-box ok-box">{applied}</div> : null}

      {intent ? (
        <div className="ai-result">
          <div className="chip-row" style={{ marginBottom: 8 }}>
            <span className="chip">{result?.source === 'ai' ? 'DeepSeek 解析' : '本地解析'}</span>
          </div>
          {result?.warning ? <div className="warn-box">{result.warning}</div> : null}

          <p className="ai-reply">{intent.reply}</p>

          {intent.type === 'log' && (
            <>
              {previews.map((p, i) => (
                <div key={`${p.def.key}-${i}`} className="ai-preview-row">
                  <div className="ai-preview-title">
                    {p.def.glyph} {p.def.name} {fmt(p.amount)}
                    {p.def.unit}
                    <span className="ai-preview-pool">经验池 {fmt(p.pool)}</span>
                  </div>
                  <GainChips grants={p.grants} />
                </div>
              ))}
              <div className="row-2" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-ghost" onClick={reset}>
                  取消
                </button>
                <button type="button" className="btn btn-primary" onClick={() => applyLog(intent)}>
                  确认入账
                </button>
              </div>
            </>
          )}

          {intent.type === 'complete_task' && (
            <div className="row-2" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => applyComplete(intent)}
              >
                标记完成
              </button>
            </div>
          )}

          {intent.type === 'request_task' && (
            <>
              <div className="ai-preview-row">
                <div className="ai-preview-title">
                  {CATEGORY_META[intent.category].glyph} {intent.title}
                  <span className="ai-preview-pool">
                    {CATEGORY_META[intent.category].name} · {DIFFICULTY_LABEL[intent.difficulty]}
                  </span>
                </div>
              </div>
              <div className="row-2" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-ghost" onClick={reset}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => applyRequest(intent)}
                >
                  创建任务
                </button>
              </div>
            </>
          )}

          {intent.type === 'chat' && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: 8 }}
              onClick={reset}
            >
              知道了
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
