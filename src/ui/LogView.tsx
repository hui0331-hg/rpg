import { useMemo, useState } from 'react'
import {
  ACTIVITIES,
  ACTIVITY_MAP,
  DIFFICULTY_LABEL,
  type ActivityDef,
} from '../data/activities'
import { CATEGORY_META, CATEGORY_ORDER, targetName } from '../data/meta'
import { achievementById } from '../core/achievements'
import { fmt } from '../core/curve'
import { dateKeyOf, previewActivity } from '../core/engine'
import { useGame } from '../state/store'
import { AiBar } from './AiBar'
import { EmptyState, GainChips, Sheet, Stepper } from './components'
import type { LogEntry } from '../types'

function groupByCategory(): Record<string, ActivityDef[]> {
  const out: Record<string, ActivityDef[]> = {}
  for (const a of ACTIVITIES) {
    ;(out[a.category] ??= []).push(a)
  }
  return out
}

const GROUPED = groupByCategory()

export function LogView() {
  const { state, logActivity } = useGame()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')
  const [result, setResult] = useState<LogEntry | null>(null)
  const [error, setError] = useState('')

  const todayKey = dateKeyOf()
  const todayLogs = useMemo(
    () => (state ? state.logs.filter((l) => l.dateKey === todayKey).reverse() : []),
    [state, todayKey],
  )
  const todayPool = todayLogs.reduce((s, l) => s + l.pool, 0)
  const cap = state?.settings.dailyPoolCap ?? 0

  const def = activeKey ? ACTIVITY_MAP[activeKey] : null

  const preview = useMemo(() => {
    if (!state || !activeKey) return null
    return previewActivity(state, activeKey, amount)
  }, [state, activeKey, amount])

  const openActivity = (key: string) => {
    const d = ACTIVITY_MAP[key]
    if (!d) return
    setActiveKey(key)
    setAmount(d.defaultAmount)
    setNote('')
    setError('')
  }

  const confirm = () => {
    if (!activeKey) return
    const outcome = logActivity(activeKey, amount, note)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    setResult(outcome.entry)
    setActiveKey(null)
  }

  return (
    <>
      {/* 今日状态 */}
      <div className="card">
        <div className="card-title">
          <span>今日</span>
          <span className="chip chip-gold">✓ {todayLogs.length} 条记录</span>
        </div>
        <div className="bar-meta" style={{ marginTop: 0, marginBottom: 6 }}>
          <span>经验池</span>
          <span>
            {fmt(todayPool)} / {cap}
          </span>
        </div>
        <div className="bar bar-tall">
          <div
            className="bar-fill"
            style={{
              width: `${Math.min(100, cap > 0 ? (todayPool / cap) * 100 : 0)}%`,
              background: todayPool >= cap ? 'var(--amber)' : 'var(--green)',
              color: todayPool >= cap ? 'var(--amber)' : 'var(--green)',
            }}
          />
        </div>
        <div className="bar-meta">
          <span>连续 {state?.character?.streakDays ?? 0} 天</span>
          <span>{todayPool >= cap ? '已达上限，明天再来' : '继续积累'}</span>
        </div>
      </div>

      {/* 一句话记录（M1：AI 意图解析） */}
      <AiBar />

      {/* 活动选择 */}
      <div className="card">
        <div className="card-title">
          <span>记录一件事</span>
        </div>
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat]
          const items = GROUPED[cat] ?? []
          if (!items.length) return null
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div className="cat-label" style={{ color: meta.color }}>
                {meta.glyph} {meta.name}
              </div>
              <div className="act-grid">
                {items.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className="act-btn"
                    onClick={() => openActivity(a.key)}
                  >
                    <span className="act-glyph">{a.glyph}</span>
                    <span className="act-name">{a.name}</span>
                    <span className="act-hint">{a.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* 今日记录 */}
      <div className="card">
        <div className="card-title">
          <span>今天做了什么</span>
        </div>
        {todayLogs.length === 0 ? (
          <EmptyState
            glyph="✎"
            title="今天还没有记录"
            desc="点上面的活动卡片，写下第一笔。"
          />
        ) : (
          todayLogs.map((log) => (
            <div className="log-item" key={log.id}>
              <div className="log-head">
                <span className="log-label">{log.label}</span>
                <span className="log-time">
                  {new Date(log.at).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="chip-row">
                {log.grants.length === 0 ? (
                  <span className="chip">未计分 · {log.capNote ?? '今日收益已用尽'}</span>
                ) : (
                  log.grants.map((g, i) => (
                    <span className="chip" key={i}>
                      {targetName(g.kind, g.key)} +{fmt(g.points)}
                    </span>
                  ))
                )}
              </div>
              {log.note ? <div className="log-note">“{log.note}”</div> : null}
              {log.levelUps.length > 0 ? (
                <div className="chip-row">
                  {log.levelUps.map((lu, i) => (
                    <span key={i} className="chip chip-gold">
                      ⬆ {lu.label} 升到 Lv.{lu.to}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {/* 录入弹层 */}
      <Sheet
        open={!!def}
        title={def ? `${def.glyph} ${def.name}` : ''}
        subtitle={def ? def.hint : undefined}
        onClose={() => setActiveKey(null)}
      >
        {def && (
          <>
            <Stepper
              value={amount}
              step={def.step}
              min={def.step}
              max={def.maxAmount}
              unit={def.unit}
              onStep={(delta) =>
                setAmount((prev) => {
                  const next = Math.round((prev + delta) * 100) / 100
                  return Math.max(def.step, Math.min(def.maxAmount, next))
                })
              }
            />

            {preview && preview.ok ? (
              <>
                <GainChips grants={preview.grants} />
                <div className="hint-box">
                  经验池 {fmt(preview.pool)}
                  {preview.rawPool !== preview.pool ? `（原始 ${fmt(preview.rawPool)}）` : ''}
                  {preview.reasons.length > 0 ? ` · ${preview.reasons.join('；')}` : ''}
                </div>
              </>
            ) : preview && !preview.ok ? (
              <div className="warn-box">{preview.error}</div>
            ) : null}

            <div className="field">
              <label htmlFor="log-note">备注（可选）</label>
              <input
                id="log-note"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：绕操场 12 圈"
                maxLength={60}
              />
            </div>

            {error ? <div className="warn-box">{error}</div> : null}

            <button type="button" className="btn btn-primary btn-block" onClick={confirm}>
              确认记录
            </button>
          </>
        )}
      </Sheet>

      {/* 结算结果弹层 */}
      <Sheet
        open={!!result}
        title="结算完成"
        subtitle={result?.label}
        onClose={() => setResult(null)}
      >
        {result && (
          <>
            {result.pool > 0 ? (
              <GainChips grants={result.grants} />
            ) : (
              <div className="warn-box">
                本次未获得属性收益 —— {result.capNote ?? '今日该类收益已用尽'}
              </div>
            )}

            <div className="hint-box">
              经验池 +{fmt(result.pool)}
              {result.streakBonus > 1
                ? ` · 连击加成 +${Math.round((result.streakBonus - 1) * 100)}%`
                : ''}
              {result.diminish < 1
                ? ` · 同类递减 ${Math.round(result.diminish * 100)}%`
                : ''}
            </div>

            {result.levelUps.length > 0 && (
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {result.levelUps.map((lu, i) => (
                  <span key={i} className="chip chip-gold">
                    ⬆ {lu.label} 升到 Lv.{lu.to}
                  </span>
                ))}
              </div>
            )}

            {(result.achievements?.length ?? 0) > 0 && (
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {result.achievements!.map((id) => (
                  <span key={id} className="chip chip-gold">
                    🏆 {achievementById(id)?.name ?? id}
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setResult(null)}
            >
              收下
            </button>
          </>
        )}
      </Sheet>
    </>
  )
}
