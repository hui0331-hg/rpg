import { useState } from 'react'
import { useGame } from './state/store'
import { Onboarding } from './ui/Onboarding'
import { PanelView } from './ui/PanelView'
import { LogView } from './ui/LogView'
import { TasksView } from './ui/TasksView'
import { ReportView } from './ui/ReportView'
import { ProfileView } from './ui/ProfileView'

type Tab = 'panel' | 'log' | 'tasks' | 'report' | 'profile'

const TABS: { key: Tab; label: string; glyph: string; title: string }[] = [
  { key: 'panel', label: '面板', glyph: '✧', title: '角色面板' },
  { key: 'log', label: '记录', glyph: '✎', title: '今日记录' },
  { key: 'tasks', label: '任务', glyph: '☰', title: '任务面板' },
  { key: 'report', label: '周报', glyph: '◈', title: '周报与记忆' },
  { key: 'profile', label: '档案', glyph: '⚙', title: '档案与设置' },
]

export default function App() {
  const { ready, state } = useGame()
  const [tab, setTab] = useState<Tab>('panel')

  if (!ready) {
    return (
      <div className="onboard" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="logo-glyph float-tip" style={{ fontSize: 34, color: 'var(--gold)' }}>
          ✦
        </div>
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>正在读取存档…</p>
      </div>
    )
  }

  if (!state?.character) {
    return <Onboarding />
  }

  const ch = state.character
  const current = TABS.find((t) => t.key === tab) ?? TABS[0]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">{current.title}</h1>
            <p className="page-desc">
              {ch.name} · Lv.{ch.level} · 连续 {ch.streakDays} 天
            </p>
          </div>
          <div className="level-ring" style={{ padding: '4px 10px' }}>
            <div className="lv-num" style={{ fontSize: 16 }}>
              {ch.streakDays > 0 ? `🔥${ch.streakDays}` : '—'}
            </div>
            <div className="lv-label">连击</div>
          </div>
        </div>
      </header>

      <main className="app-main" key={tab}>
        {tab === 'panel' && <PanelView />}
        {tab === 'log' && <LogView />}
        {tab === 'tasks' && <TasksView />}
        {tab === 'report' && <ReportView />}
        {tab === 'profile' && <ProfileView />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? 'active' : ''}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
          >
            <span className="tab-glyph">{t.glyph}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
