import { useEffect, type ReactNode } from 'react'
import { fmt } from '../core/curve'
import { targetColor, targetName } from '../data/meta'
import type { Grant } from '../types'

export function Bar({
  value,
  color,
  tall = false,
}: {
  value: number
  color: string
  tall?: boolean
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={`bar${tall ? ' bar-tall' : ''}`}>
      <div
        className="bar-fill"
        style={{ width: `${pct}%`, background: color, color }}
      />
    </div>
  )
}

export function GainChips({ grants }: { grants: Grant[] }) {
  if (!grants.length) {
    return <span className="chip">本次无属性收益</span>
  }
  return (
    <div className="gain-list">
      {grants.map((g, i) => {
        const color = targetColor(g.kind, g.key)
        return (
          <span
            key={`${g.kind}-${g.key}-${i}`}
            className="gain"
            style={{
              color,
              background: `${color}16`,
              border: `1px solid ${color}44`,
              animationDelay: `${i * 55}ms`,
            }}
          >
            {targetName(g.kind, g.key)} +{fmt(g.points)}
          </span>
        )
      })}
    </div>
  )
}

export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet-mask" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-grabber" />
        <h3>{title}</h3>
        {subtitle ? <p className="sheet-sub">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  )
}

export function Stepper({
  value,
  step,
  min,
  max,
  unit,
  onStep,
}: {
  value: number
  step: number
  min: number
  max: number
  unit: string
  /** 传增量而不是绝对值：连续快速点击时每次都能在最新值上累加，不会丢步 */
  onStep: (delta: number) => void
}) {
  return (
    <>
      <div className="stepper">
        <button
          type="button"
          onClick={() => onStep(-step)}
          aria-label="减少"
          disabled={value <= min}
        >
          −
        </button>
        <div className="amount">
          {fmt(value)}
          <small>{unit}</small>
        </div>
        <button
          type="button"
          onClick={() => onStep(step)}
          aria-label="增加"
          disabled={value >= max}
        >
          +
        </button>
      </div>
      <div className="bar-meta">
        <span>
          范围 {fmt(min)}–{fmt(max)} {unit}
        </span>
        <span>步进 {fmt(step)}</span>
      </div>
    </>
  )
}

export function EmptyState({
  glyph = '✦',
  title,
  desc,
}: {
  glyph?: string
  title: string
  desc?: string
}) {
  return (
    <div className="empty">
      <span className="empty-glyph">{glyph}</span>
      <div>{title}</div>
      {desc ? <div style={{ marginTop: 4, fontSize: 12 }}>{desc}</div> : null}
    </div>
  )
}
