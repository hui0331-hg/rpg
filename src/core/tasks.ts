import { TASK_GRANT_BY_CATEGORY, TASK_POOL_BY_DIFFICULTY } from '../data/activities'
import { dateKeyOf, uid } from './engine'
import type { Category, Difficulty, Task } from '../types'

export interface NewTaskInput {
  title: string
  category: Category
  difficulty: Difficulty
  detail?: string
  dueDateKey?: string
  source?: 'manual' | 'ai'
  now?: Date
}

/**
 * 创建任务时就把奖励池与分配比例固定下来。
 * 好处：以后调整平衡表，不会让历史任务的价值突然变化。
 */
export function makeTask(input: NewTaskInput): Task {
  const now = input.now ?? new Date()
  const grants = TASK_GRANT_BY_CATEGORY[input.category].map((g) => ({ ...g }))
  return {
    id: uid(),
    title: input.title.trim(),
    detail: input.detail?.trim() || undefined,
    category: input.category,
    difficulty: input.difficulty,
    state: 'pending',
    source: input.source ?? 'manual',
    createdAt: now.toISOString(),
    dateKey: dateKeyOf(now),
    dueDateKey: input.dueDateKey,
    pool: TASK_POOL_BY_DIFFICULTY[input.difficulty],
    grants,
  }
}

export function pendingTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.state === 'pending')
    .sort((a, b) => {
      // 有截止日期的优先，其次按创建时间倒序
      if (a.dueDateKey && b.dueDateKey) return a.dueDateKey.localeCompare(b.dueDateKey)
      if (a.dueDateKey) return -1
      if (b.dueDateKey) return 1
      return b.createdAt.localeCompare(a.createdAt)
    })
}

export function finishedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.state !== 'pending')
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))
}
