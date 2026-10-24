import { attributeGains, dailyPoolSeries, taskStats } from '../core/stats'
import { fmt } from '../core/curve'
import { useGame } from '../state/store'

export function TrendCard() {
  const { state } = useGame()
  if (!state) return null

  const series = dailyPoolSeries(state, 7)
  const max = Math.max(...series.map((s) => s.pool), 1)
  const stats = taskStats(state, 7)
  const gains = attributeGains(state, 7)
  const total = series.reduce((s, p) => s + p.pool, 0)
  const activeDays = series.filter((s) => s.logs > 0).length
  const topGain = gains[0]

  return (
    <div className="card">
      <div className="card-title">
        <span>最近 7 天</span>
        <span className="chip">{activeDays}/7 天有记录</span>
      </div>

      <div className="bars">
        {series.map((p) => {
          const h = p.pool <= 0 ? 3 : Math.max(6, Math.round((p.pool / max) * 72))
          const isToday = p.label === '今天'
          return (
            <div className="bar-col" key={p.dateKey}>
              <div className="bar-val">{p.pool > 0 ? fmt(p.pool) : ''}</div>
              <div
                className="bar-fill-col"
                style={{
                  height: `${h}px`,
                  background: isToday
                    ? 'linear-gradient(180deg, #f3d894, #b8893c)'
                    : p.pool > 0
                      ? 'linear-gradient(180deg, #6ea8ff, #3c6bb8)'
                      : 'rgba(255,255,255,0.07)',
                }}
              />
              <div className={`bar-lbl ${isToday ? 'today' : ''}`}>{p.label}</div>
            </div>
          )
        })}
      </div>

      <div className="stat-row" style={{ marginTop: 14 }}>
        <div className="stat-box">
          <div className="stat-num">{fmt(total)}</div>
          <div className="stat-label">7 日总经验</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">
            {stats.rate == null ? '—' : `${Math.round(stats.rate * 100)}%`}
          </div>
          <div className="stat-label">
            任务完成 {stats.done}/{stats.done + stats.cancelled || 0}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: topGain?.color }}>
            {topGain ? fmt(topGain.points) : '0'}
          </div>
          <div className="stat-label">最高增长 · {topGain?.name ?? '—'}</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {gains.map((g) => {
          const width = Math.max(2, Math.round((g.points / Math.max(1, gains[0].points)) * 100))
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
              <span className="gain-row-val">{fmt(g.points)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
