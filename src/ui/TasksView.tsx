import { useMemo, useState } from 'react'
import { TASK_GRANT_BY_CATEGORY, TASK_POOL_BY_DIFFICULTY, DIFFICULTY_LABEL } from '../data/activities'
import { CATEGORY_META, CATEGORY_ORDER, targetColor, targetName } from '../data/meta'
import { fmt } from '../core/curve'
import { finishedTasks, pendingTasks } from '../core/tasks'
import { achievementById } from '../core/achievements'
import { useGame } from '../state/store'
import { DispatchCard } from './DispatchCard'
import { EmptyState, GainChips, Sheet } from './components'
import type { Category, Difficulty, LogEntry, Task } from '../types'

const DIFFICULTIES: Difficulty[] = [1, 2, 3]

function rewardChips(task: Task) {
  return task.grants.map((g) => ({
    kind: g.kind,
    key: g.key,
    points: Math.round(task.pool * g.ratio * 10) / 10,
  }))
}

export function TasksView() {
  const { state, addTask, completeTask, cancelTask, removeTask } = useGame()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('mind')
  const [difficulty, setDifficulty] = useState<Difficulty>(2)
  const [detail, setDetail] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [result, setResult] = useState<LogEntry | null>(null)
  const [error, setError] = useState('')

  const tasks = state?.tasks ?? []
  const pending = useMemo(() => pendingTasks(tasks), [tasks])
  const finished = useMemo(() => finishedTasks(tasks).slice(0, 8), [tasks])

  const submit = () => {
    if (!title.trim()) {
      setError('先给任务起个名字。')
      return
    }
    addTask({
      title,
      category,
      difficulty,
      detail: detail.trim() || undefined,
      dueDateKey: dueDate || undefined,
    })
    setTitle('')
    setDetail('')
    setDueDate('')
    setError('')
    setCreating(false)
  }

  const complete = (task: Task) => {
    const outcome = completeTask(task.id)
    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    setResult(outcome.entry)
  }

  return (
    <>
      <DispatchCard />

      <div className="card">
        <div className="card-title">
          <span>任务面板</span>
          <span className="chip">
            {pending.length} 待办 / {tasks.length} 总计
          </span>
        </div>
        <p className="page-desc" style={{ marginBottom: 12 }}>
          也可以自己新建任务。系统派发的任务会在完成后按难度结算奖励。
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => setCreating(true)}
        >
          ＋ 新建任务
        </button>
      </div>

      <div className="card">
        <div className="card-title">
          <span>待办</span>
        </div>
        {pending.length === 0 ? (
          <EmptyState glyph="☰" title="没有待办任务" desc="新建一个，或者先去记录今天已经做过的事。" />
        ) : (
          pending.map((task) => {
            const meta = CATEGORY_META[task.category]
            return (
              <div className="task-item" key={task.id}>
                <div
                  className="task-cat"
                  style={{ background: `${meta.color}1c`, color: meta.color }}
                >
                  {meta.glyph}
                </div>
                <div className="task-body">
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    <span>{DIFFICULTY_LABEL[task.difficulty]}</span>
                    <span>·</span>
                    <span>{targetName(task.grants[0].kind, task.grants[0].key)} 系</span>
                    <span>·</span>
                    <span>奖励池 {fmt(task.pool)}</span>
                    {task.dueDateKey ? (
                      <>
                        <span>·</span>
                        <span style={{ color: 'var(--amber)' }}>截止 {task.dueDateKey.slice(5)}</span>
                      </>
                    ) : null}
                  </div>
                  {task.detail ? <div className="log-note">{task.detail}</div> : null}
                </div>
                <div className="task-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="完成任务"
                    onClick={() => complete(task)}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="取消任务"
                    onClick={() => cancelTask(task.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {finished.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span>已完成 / 已取消</span>
          </div>
          {finished.map((task) => {
            const meta = CATEGORY_META[task.category]
            return (
              <div className="task-item" key={task.id}>
                <div
                  className="task-cat"
                  style={{ background: `${meta.color}14`, color: `${meta.color}99` }}
                >
                  {meta.glyph}
                </div>
                <div className="task-body">
                  <div className={`task-title ${task.state === 'done' ? 'done' : ''}`}>
                    {task.title}
                  </div>
                  <div className="task-meta">
                    <span>{task.state === 'done' ? '已完成' : '已取消'}</span>
                    {task.completedAt ? (
                      <>
                        <span>·</span>
                        <span>{new Date(task.completedAt).toLocaleDateString('zh-CN')}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="task-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="删除记录"
                    onClick={() => removeTask(task.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新建任务 */}
      <Sheet
        open={creating}
        title="新建任务"
        subtitle="奖励在创建时固定，之后调整平衡表不会改变它。"
        onClose={() => setCreating(false)}
      >
        <div className="field">
          <label htmlFor="task-title">任务内容 *</label>
          <input
            id="task-title"
            className="input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setError('')
            }}
            placeholder="例如：背 20 个英语单词"
            maxLength={60}
          />
        </div>

        <div className="field">
          <label>分类</label>
          <div className="chip-row">
            {CATEGORY_ORDER.map((c) => {
              const meta = CATEGORY_META[c]
              const active = category === c
              return (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  onClick={() => setCategory(c)}
                  style={
                    active
                      ? {
                          borderColor: `${meta.color}88`,
                          background: `${meta.color}20`,
                          color: meta.color,
                        }
                      : undefined
                  }
                >
                  {meta.glyph} {meta.name}
                </button>
              )
            })}
          </div>
        </div>

        <div className="field">
          <label>难度</label>
          <div className="chip-row">
            {DIFFICULTIES.map((d) => {
              const active = difficulty === d
              return (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  onClick={() => setDifficulty(d)}
                  style={
                    active
                      ? {
                          borderColor: 'rgba(232,200,122,0.6)',
                          background: 'rgba(232,200,122,0.12)',
                          color: 'var(--gold)',
                        }
                      : undefined
                  }
                >
                  {DIFFICULTY_LABEL[d]} · 奖励池 {TASK_POOL_BY_DIFFICULTY[d]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="field">
          <label htmlFor="task-due">截止日期（可选）</label>
          <input
            id="task-due"
            type="date"
            className="input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="task-detail">备注（可选）</label>
          <input
            id="task-detail"
            className="input"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="补充说明、验收标准"
            maxLength={80}
          />
        </div>

        <div className="hint-box">
          完成后预计获得：
          <div style={{ marginTop: 6 }}>
            {TASK_GRANT_BY_CATEGORY[category].map((g, i) => (
              <span
                key={i}
                className="chip"
                style={{ marginRight: 6, color: targetColor(g.kind, g.key) }}
              >
                {targetName(g.kind, g.key)} +
                {fmt(TASK_POOL_BY_DIFFICULTY[difficulty] * g.ratio)}
              </span>
            ))}
          </div>
        </div>

        {error ? <div className="warn-box">{error}</div> : null}

        <button type="button" className="btn btn-primary btn-block" onClick={submit}>
          创建任务
        </button>
      </Sheet>

      {/* 完成结算 */}
      <Sheet
        open={!!result}
        title="任务完成"
        subtitle={result?.taskTitle}
        onClose={() => setResult(null)}
      >
        {result && (
          <>
            <GainChips grants={result.grants} />
            <div className="hint-box">
              奖励池 +{fmt(result.pool)}
              {result.streakBonus > 1
                ? ` · 连击加成 +${Math.round((result.streakBonus - 1) * 100)}%`
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
