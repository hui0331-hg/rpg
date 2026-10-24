import { achievementViews } from '../core/achievements'
import { TIER_COLOR, TIER_LABEL } from '../data/achievements'
import { fmt } from '../core/curve'
import { useGame } from '../state/store'

export function AchievementsCard({ limit = 6 }: { limit?: number }) {
  const { state } = useGame()
  if (!state) return null

  const views = achievementViews(state)
  const owned = views.filter((v) => v.unlocked).length
  const shown = views.slice(0, limit)

  return (
    <div className="card">
      <div className="card-title">
        <span>成就</span>
        <span className="chip">
          {owned} / {views.length}
        </span>
      </div>

      <div className="ach-grid">
        {shown.map((v) => (
          <div
            key={v.id}
            className={`ach ${v.unlocked ? '' : 'locked'}`}
            style={{ borderColor: v.unlocked ? `${TIER_COLOR[v.tier]}66` : undefined }}
          >
            <div
              className="ach-glyph"
              style={{
                color: TIER_COLOR[v.tier],
                background: `${TIER_COLOR[v.tier]}18`,
              }}
            >
              {v.glyph}
            </div>
            <div className="ach-name">{v.name}</div>
            <div className="ach-tier">{TIER_LABEL[v.tier]}</div>
            {v.unlocked ? (
              <div className="ach-done">✓ 已解锁</div>
            ) : (
              <>
                <div className="ach-bar">
                  <div
                    className="ach-bar-fill"
                    style={{
                      width: `${Math.round(v.ratio * 100)}%`,
                      background: TIER_COLOR[v.tier],
                    }}
                  />
                </div>
                <div className="ach-progress">
                  {fmt(v.current)}/{fmt(v.target)}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="page-desc" style={{ marginTop: 10, marginBottom: 0 }}>
        成就只从记录里复算，不靠系统「授予」。点开历史记录能查到每个徽章的来路。
      </p>
    </div>
  )
}
