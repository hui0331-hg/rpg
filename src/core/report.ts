/**
 * 周报（M3）。
 *
 * 全部数字从日志/任务复算，AI 只能润色措辞、不能改动数字，
 * 也不允许编造「本周你坚持得非常好」这类没有数据支撑的评价。
 */
import { ACTIVITY_MAP } from '../data/activities'
import { ACHIEVEMENT_MAP } from '../data/achievements'
import { CORE_META } from '../data/meta'
import { attributeGains, dailyPoolSeries, taskStats } from './stats'
import { dateKeyOf, shiftDateKey } from './time'
import type { AppState, CoreKey } from '../types'

export interface ReportGain {
  key: CoreKey
  name: string
  color: string
  points: number
}

export interface WeekReport {
  periodStart: string
  periodEnd: string
  totalPool: number
  activeDays: number
  bestDay: { dateKey: string; pool: number } | null
  gains: ReportGain[]
  tasksCreated: number
  tasksDone: number
  completionRate: number | null
  topActivity: { name: string; count: number; amount: number; unit: string } | null
  newAchievements: { id: string; name: string }[]
  headline: string
  suggestion: string
  markdown: string
}

export function buildWeekReport(state: AppState, now: Date = new Date()): WeekReport {
  const periodEnd = dateKeyOf(now)
  const periodStart = shiftDateKey(periodEnd, -6)

  const series = dailyPoolSeries(state, 7, now)
  const totalPool = Math.round(series.reduce((s, p) => s + p.pool, 0) * 10) / 10
  const activeDays = series.filter((p) => p.logs > 0).length
  const best = series.reduce(
    (acc, p) => (p.pool > acc.pool ? { dateKey: p.dateKey, pool: p.pool } : acc),
    { dateKey: '', pool: 0 },
  )

  const gains = attributeGains(state, 7, now).map((g) => ({
    key: g.key,
    name: g.name,
    color: g.color,
    points: g.points,
  }))

  const ts = taskStats(state, 7, now)

  // 本周最常做的活动
  const counts = new Map<string, { count: number; amount: number }>()
  for (const log of state.logs) {
    if (log.dateKey < periodStart) continue
    if (log.kind !== 'activity' || !log.activityKey) continue
    const slot = counts.get(log.activityKey) ?? { count: 0, amount: 0 }
    slot.count += 1
    slot.amount += log.amount ?? 0
    counts.set(log.activityKey, slot)
  }
  const topEntry = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0]
  const topActivity = topEntry
    ? {
        name: ACTIVITY_MAP[topEntry[0]]?.name ?? topEntry[0],
        count: topEntry[1].count,
        amount: Math.round(topEntry[1].amount * 10) / 10,
        unit: ACTIVITY_MAP[topEntry[0]]?.unit ?? '',
      }
    : null

  const newAchievements = state.achievements
    .filter((a) => dateKeyOf(new Date(a.unlockedAt)) >= periodStart)
    .map((a) => ({ id: a.id, name: ACHIEVEMENT_MAP[a.id]?.name ?? a.id }))

  const headline =
    totalPool === 0
      ? '这一周没有留下记录'
      : `这周 ${activeDays} 天有记录，累计 ${totalPool} 点经验`

  const zeroGains = gains.filter((g) => g.points === 0).map((g) => g.name)
  const suggestion = buildSuggestion({
    totalPool,
    activeDays,
    completionRate: ts.rate,
    zeroGains,
    topActivityName: topActivity?.name ?? null,
  })

  const markdown = buildMarkdown({
    periodStart,
    periodEnd,
    totalPool,
    activeDays,
    bestDay: best.pool > 0 ? best : null,
    gains,
    tasksDone: ts.done,
    tasksCreated: ts.createdAt,
    completionRate: ts.rate,
    topActivity,
    newAchievements,
    headline,
    suggestion,
  })

  return {
    periodStart,
    periodEnd,
    totalPool,
    activeDays,
    bestDay: best.pool > 0 ? best : null,
    gains,
    tasksCreated: ts.createdAt,
    tasksDone: ts.done,
    completionRate: ts.rate,
    topActivity,
    newAchievements,
    headline,
    suggestion,
    markdown,
  }
}

function buildSuggestion(input: {
  totalPool: number
  activeDays: number
  completionRate: number | null
  zeroGains: string[]
  topActivityName: string | null
}): string {
  const { totalPool, activeDays, completionRate, zeroGains, topActivityName } = input

  if (totalPool === 0) {
    return '这周还没开始。别定计划，先随手记一件 5 分钟能做完的小事，把记录这件事接上。'
  }
  if (activeDays <= 2) {
    return `这周只有 ${activeDays} 天有记录。下周不要加量，目标是「每天都有一条」，哪怕只是一次散步。`
  }
  if (completionRate != null && completionRate < 0.4) {
    return `任务完成率 ${Math.round(completionRate * 100)}%，说明定得偏大。下周把任务难度降到最低档，先找回完成感。`
  }
  if (zeroGains.length > 0) {
    return `${zeroGains.join('、')}这周完全没有增长。下周每天给它们 10 分钟就够，比如碎片时间做一件小事。`
  }
  if (topActivityName) {
    return `节奏不错。${topActivityName}已经是稳定习惯了，下周可以试着把某一项任务的难度提一档。`
  }
  return '保持现在的节奏就行，别急着加码。'
}

function buildMarkdown(r: {
  periodStart: string
  periodEnd: string
  totalPool: number
  activeDays: number
  bestDay: { dateKey: string; pool: number } | null
  gains: ReportGain[]
  tasksDone: number
  tasksCreated: number
  completionRate: number | null
  topActivity: { name: string; count: number; amount: number; unit: string } | null
  newAchievements: { name: string }[]
  headline: string
  suggestion: string
}): string {
  const lines: string[] = []
  lines.push(`# 个人 RPG 周报（${r.periodStart} ~ ${r.periodEnd}）`)
  lines.push('')
  lines.push(`**${r.headline}**`)
  lines.push('')
  lines.push('## 数据')
  lines.push('')
  lines.push(`- 累计经验池：${r.totalPool}`)
  lines.push(`- 活跃天数：${r.activeDays}/7`)
  if (r.bestDay) lines.push(`- 最高单日：${r.bestDay.dateKey}（${r.bestDay.pool} 点）`)
  lines.push(
    `- 任务：完成 ${r.tasksDone} / 新建 ${r.tasksCreated}${
      r.completionRate == null ? '' : `（完成率 ${Math.round(r.completionRate * 100)}%）`
    }`,
  )
  if (r.topActivity) {
    lines.push(
      `- 最常做：${r.topActivity.name} ${r.topActivity.count} 次，共 ${r.topActivity.amount}${r.topActivity.unit}`,
    )
  }
  lines.push('')
  lines.push('## 属性增长')
  lines.push('')
  lines.push('| 属性 | 本周增长 |')
  lines.push('| --- | --- |')
  for (const g of r.gains) lines.push(`| ${g.name} | +${g.points} |`)
  lines.push('')
  if (r.newAchievements.length > 0) {
    lines.push('## 新解锁成就')
    lines.push('')
    for (const a of r.newAchievements) lines.push(`- ${a.name}`)
    lines.push('')
  }
  lines.push('## 下周建议')
  lines.push('')
  lines.push(r.suggestion)
  return lines.join('\n')
}
