import { useState } from 'react'
import { buildWeekReport } from '../core/report'
import { dailyPoolSeries } from '../core/stats'
import { buildMemoryDigest } from '../core/memory'
import { fmt } from '../core/curve'
import { useGame } from '../state/store'

export function ReportView() {
  const { state } = useGame()
  const [copied, setCopied] = useState('')

  if (!state) return null

  const report = buildWeekReport(state)
  const series = dailyPoolSeries(state, 7)
  const memory = buildMemoryDigest(state)
  const maxPool = Math.max(...series.map((s) => s.pool), 1)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown)
      setCopied('已复制 Markdown 到剪贴板')
    } catch {
      setCopied('复制失败（浏览器不允许）。可以长按下方文本手动复制。')
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-title">
          <span>最近 7 天周报</span>
          <span className="chip">
            {report.periodStart.slice(5)} ~ {report.periodEnd.slice(5)}
          </span>
        </div>

        <p className="report-headline">{report.headline}</p>

        <div className="stat-row" style={{ marginTop: 12 }}>
          <div className="stat-box">
            <div className="stat-num">{fmt(report.totalPool)}</div>
            <div className="stat-label">经验池</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{report.activeDays}/7</div>
            <div className="stat-label">活跃天数</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">
              {report.completionRate == null ? '—' : `${Math.round(report.completionRate * 100)}%`}
            </div>
            <div className="stat-label">完成 {report.tasksDone} 个任务</div>
          </div>
        </div>

        <div className="bars" style={{ marginTop: 14 }}>
          {series.map((p) => {
            const h = p.pool <= 0 ? 3 : Math.max(6, Math.round((p.pool / maxPool) * 64))
            return (
              <div className="bar-col" key={p.dateKey}>
                <div className="bar-val">{p.pool > 0 ? fmt(p.pool) : ''}</div>
                <div
                  className="bar-fill-col"
                  style={{
                    height: `${h}px`,
                    background:
                      p.label === '今天'
                        ? 'linear-gradient(180deg, #f3d894, #b8893c)'
                        : p.pool > 0
                          ? 'linear-gradient(180deg, #6ea8ff, #3c6bb8)'
                          : 'rgba(255,255,255,0.07)',
                  }}
                />
                <div className={`bar-lbl ${p.label === '今天' ? 'today' : ''}`}>{p.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span>属性增长</span>
        </div>
        {report.gains.map((g) => {
          const width = Math.max(2, Math.round((g.points / Math.max(1, report.gains[0].points)) * 100))
          return (
            <div className="gain-row" key={g.key}>
              <span className="gain-row-name" style={{ color: g.color }}>
                {g.name}
              </span>
              <div className="gain-row-track">
                <div
                  className="gain-row-fill"
                  style={{ width: `${width}%`, background: g.color }}
                />
              </div>
              <span className="gain-row-val">+{fmt(g.points)}</span>
            </div>
          )
        })}

        <div className="section-gap" style={{ marginTop: 14 }}>
          {report.topActivity ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              最常做：{report.topActivity.name} {report.topActivity.count} 次，共{' '}
              {fmt(report.topActivity.amount)}
              {report.topActivity.unit}
            </div>
          ) : null}
          {report.bestDay ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              最高单日：{report.bestDay.dateKey.slice(5)}（{fmt(report.bestDay.pool)} 点）
            </div>
          ) : null}
        </div>
      </div>

      {report.newAchievements.length > 0 ? (
        <div className="card">
          <div className="card-title">
            <span>本周新解锁</span>
          </div>
          <div className="chip-row">
            {report.newAchievements.map((a) => (
              <span key={a.id} className="chip chip-gold">
                ✓ {a.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">
          <span>下周建议</span>
        </div>
        <p className="report-suggestion">{report.suggestion}</p>
        <div className="hint-box" style={{ marginBottom: 0 }}>
          建议是规则算的，不是 AI 编的：先看活跃天数，再看完成率，最后看哪项属性停滞。
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span>系统记得的你</span>
        </div>
        <div className="memory-list">
          <div className="memory-row">
            <span className="memory-k">记录</span>
            <span className="memory-v">
              {memory.daysLogged} 天 / {memory.totalLogs} 条 · 最长连击 {memory.longestStreak} 天
            </span>
          </div>
          <div className="memory-row">
            <span className="memory-k">稳定习惯</span>
            <span className="memory-v">{memory.habits.length ? memory.habits.join('、') : '还没有形成'}</span>
          </div>
          <div className="memory-row">
            <span className="memory-k">需要补</span>
            <span className="memory-v">{memory.stale.length ? memory.stale.join('、') : '暂时没有明显停滞'}</span>
          </div>
          <div className="memory-row">
            <span className="memory-k">常做</span>
            <span className="memory-v">
              {memory.topActivities.length
                ? memory.topActivities.map((a) => `${a.name}(${a.count})`).join('、')
                : '—'}
            </span>
          </div>
        </div>
        <p className="page-desc" style={{ marginBottom: 0 }}>
          这段摘要会随每次请求发给 AI，所以它记得你的习惯和停滞项 —— 但它是算出来的，不是编的。
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          <span>导出</span>
        </div>
        <button type="button" className="btn btn-block" onClick={copy}>
          复制 Markdown 周报
        </button>
        {copied ? <div className="hint-box ok-box">{copied}</div> : null}
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>
            查看文本
          </summary>
          <pre className="report-pre">{report.markdown}</pre>
        </details>
      </div>
    </>
  )
}
