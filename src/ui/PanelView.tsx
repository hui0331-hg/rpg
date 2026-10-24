import { CORE_META, CORE_ORDER, SKILL_META, SKILL_ORDER, targetName } from '../data/meta'
import { fmt, needXp, progressOf } from '../core/curve'
import { dateKeyOf } from '../core/engine'
import { useGame } from '../state/store'
import { Bar, EmptyState } from './components'
import { AchievementsCard } from './AchievementsCard'
import { TrendCard } from './TrendCard'

export function PanelView() {
  const { state } = useGame()
  const ch = state?.character
  if (!ch || !state) return null

  const todayKey = dateKeyOf()
  const todayLogs = state.logs.filter((l) => l.dateKey === todayKey)
  const todayPool = todayLogs.reduce((s, l) => s + l.pool, 0)
  const charProgress = progressOf(
    { level: ch.level, xp: ch.xp, totalXp: ch.totalXp },
    'char',
  )
  const charNeed = needXp(ch.level, 'char')
  const recent = [...state.logs].slice(-4).reverse()

  const profileBits = [
    ch.age != null ? `${ch.age} 岁` : null,
    ch.gender && ch.gender !== '不填' ? ch.gender : null,
    ch.identity || null,
    ch.heightCm != null ? `${ch.heightCm}cm` : null,
    ch.weightKg != null ? `${ch.weightKg}kg` : null,
  ].filter(Boolean) as string[]

  return (
    <>
      {/* 角色头部 */}
      <div className="card hero">
        <div className="hero-top">
          <div>
            <h2 className="hero-name">{ch.name}</h2>
            <div className="hero-sub">{profileBits.join(' · ') || '尚未填写档案信息'}</div>
          </div>
          <div className="level-ring">
            <div className="lv-num">Lv.{ch.level}</div>
            <div className="lv-label">综合</div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Bar value={charProgress} color="var(--gold)" tall />
          <div className="bar-meta">
            <span>
              {fmt(ch.xp)} / {fmt(charNeed)} EXP
            </span>
            <span>累计 {fmt(ch.totalXp)}</span>
          </div>
        </div>

        <div className="stat-row" style={{ marginTop: 14 }}>
          <div className="stat-box">
            <div className="stat-num">{ch.streakDays}</div>
            <div className="stat-label">连续天数</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">
              {fmt(todayPool)}
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                /{state.settings.dailyPoolCap}
              </span>
            </div>
            <div className="stat-label">今日经验</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">{state.logs.length}</div>
            <div className="stat-label">总记录</div>
          </div>
        </div>

        {ch.goals.length > 0 && (
          <div className="chip-row" style={{ marginTop: 12 }}>
            {ch.goals.map((g, i) => (
              <span key={i} className="chip">
                🎯 {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 主属性 */}
      <div className="card">
        <div className="card-title">
          <span>主属性</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: 0 }}>
            每级所需经验随等级递增
          </span>
        </div>
        <div className="attr-grid">
          {CORE_ORDER.map((key) => {
            const meta = CORE_META[key]
            const track = ch.core[key]
            const pct = progressOf(track, 'core')
            const need = needXp(track.level, 'core')
            return (
              <div className="attr" key={key}>
                <div className="attr-head">
                  <div
                    className="attr-glyph"
                    style={{ background: `${meta.color}20`, color: meta.color }}
                  >
                    {meta.glyph}
                  </div>
                  <span className="attr-name">{meta.name}</span>
                  <span className="attr-lv">
                    <b>{track.level}</b>
                  </span>
                </div>
                <Bar value={pct} color={meta.color} />
                <div className="bar-meta">
                  <span>
                    {fmt(track.xp)}/{fmt(need)}
                  </span>
                  <span>累计 {fmt(track.totalXp)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 技能 */}
      <div className="card">
        <div className="card-title">
          <span>技能精通度</span>
        </div>
        {SKILL_ORDER.map((key) => {
          const meta = SKILL_META[key]
          const track = ch.skills[key]
          const pct = progressOf(track, 'skill')
          const need = needXp(track.level, 'skill')
          return (
            <div className="skill-row" key={key}>
              <div className="skill-glyph" style={{ color: meta.color }}>
                {meta.glyph}
              </div>
              <div>
                <div className="skill-name">
                  {meta.name}
                  <span className="skill-desc">{meta.desc}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Bar value={pct} color={meta.color} />
                </div>
              </div>
              <div className="skill-lv">
                Lv.{track.level}
                <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                  {fmt(track.xp)}/{fmt(need)}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 最近 7 天趋势 */}
      <TrendCard />

      <AchievementsCard />

      {/* 最近动态 */}
      <div className="card">
        <div className="card-title">
          <span>最近动态</span>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            glyph="✦"
            title="面板还是一张白纸"
            desc="去「记录」页写下第一件事，属性就会开始生长。"
          />
        ) : (
          recent.map((log) => (
            <div className="log-item" key={log.id}>
              <div className="log-head">
                <span className="log-label">{log.label}</span>
                <span className="log-time">
                  {log.dateKey.slice(5)} {new Date(log.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="chip-row">
                {log.grants.map((g, i) => (
                  <span className="chip" key={i}>
                    {targetName(g.kind, g.key)} +{fmt(g.points)}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  )
}
