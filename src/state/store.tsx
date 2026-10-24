import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { BALANCE } from '../data/balance'
import { CORE_ORDER, SKILL_ORDER } from '../data/meta'
import {
  dateKeyOf,
  emptyTracks,
  settleActivity,
  settleTask,
  type ActivityOutcome,
  type TaskOutcome,
} from '../core/engine'
import { makeTask, type NewTaskInput } from '../core/tasks'
import { applyAchievements } from '../core/achievements'
import { clearState, loadState, saveState } from '../storage/db'
import type {
  AppState,
  Category,
  Character,
  Difficulty,
  DispatchRecord,
  LlmSettings,
  Settings,
} from '../types'

export const STATE_VERSION = 1

export interface ProfileInput {
  name: string
  age: number | null
  gender: string
  identity: string
  heightCm: number | null
  weightKg: number | null
  goals: string[]
}

export const DEFAULT_LLM: LlmSettings = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
  proxyUrl: '',
}

export const DEFAULT_SETTINGS: Settings = {
  dailyPoolCap: BALANCE.dailyPoolCap,
  taskDailyCap: BALANCE.taskDailyCap,
  streakEnabled: true,
  llm: { ...DEFAULT_LLM },
}

export function emptyState(): AppState {
  return {
    version: STATE_VERSION,
    character: null,
    logs: [],
    tasks: [],
    settings: { ...DEFAULT_SETTINGS, llm: { ...DEFAULT_LLM } },
    dispatchHistory: [],
    achievements: [],
  }
}

/**
 * 兼容旧存档：老版本没有 settings.llm 字段，直接浅展开会把它丢掉。
 * 这里做结构化合并，缺什么补什么。
 */
export function mergeLoadedState(loaded: Partial<AppState>): AppState {
  const base = emptyState()
  const loadedSettings = (loaded.settings ?? {}) as Partial<Settings>
  return {
    ...base,
    ...loaded,
    version: STATE_VERSION,
    logs: loaded.logs ?? [],
    tasks: loaded.tasks ?? [],
    dispatchHistory: loaded.dispatchHistory ?? [],
    achievements: loaded.achievements ?? [],
    settings: {
      ...base.settings,
      ...loadedSettings,
      llm: { ...base.settings.llm, ...(loadedSettings.llm ?? {}) },
    },
  }
}

function buildCharacter(p: ProfileInput): Character {
  const now = new Date()
  return {
    name: p.name.trim() || '旅者',
    age: p.age,
    gender: p.gender,
    identity: p.identity,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    goals: p.goals,
    core: emptyTracks(CORE_ORDER),
    skills: emptyTracks(SKILL_ORDER),
    level: 1,
    xp: 0,
    totalXp: 0,
    streakDays: 0,
    lastActiveDate: null,
    createdAt: now.toISOString(),
  }
}

export interface GameApi {
  ready: boolean
  state: AppState | null
  saveError: string | null
  createCharacter: (profile: ProfileInput) => void
  logActivity: (activityKey: string, amount: number, note?: string) => ActivityOutcome
  addTask: (input: Omit<NewTaskInput, 'now'>) => void
  completeTask: (taskId: string) => TaskOutcome
  cancelTask: (taskId: string) => void
  removeTask: (taskId: string) => void
  updateProfile: (patch: Partial<ProfileInput>) => void
  updateSettings: (patch: Partial<Settings>) => void
  updateLlm: (patch: Partial<LlmSettings>) => void
  recordDispatch: (record: Omit<DispatchRecord, 'id' | 'at'>) => void
  exportJson: () => string
  importJson: (text: string) => { ok: boolean; error?: string }
  hardReset: () => Promise<void>
  todayKey: string
}

/** 仅供测试注入假数据用（业务代码请走 useGame） */
export const GameContext = createContext<GameApi | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null)
  const [ready, setReady] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const stateRef = useRef<AppState | null>(null)
  const [todayKey, setTodayKey] = useState(() => dateKeyOf())

  // 提交新状态（同步更新 ref，保证连续操作不读到旧状态）
  const commit = useCallback((next: AppState) => {
    stateRef.current = next
    setState(next)
  }, [])

  // 首次加载
  useEffect(() => {
    let alive = true
    loadState()
      .then((loaded) => {
        if (!alive) return
        const initial = loaded ? mergeLoadedState(loaded) : emptyState()
        // 老存档没有 achievements 字段时补算一次，避免「有记录但成就全是灰的」
        const backfilled = applyAchievements(initial).state
        stateRef.current = backfilled
        setState(backfilled)
      })
      .catch(() => {
        if (!alive) return
        stateRef.current = emptyState()
        setState(emptyState())
      })
      .finally(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  // 落盘（防抖 250ms）
  useEffect(() => {
    if (!ready || !state) return
    const t = window.setTimeout(() => {
      saveState(state)
        .then(() => setSaveError(null))
        .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : '存档失败'))
    }, 250)
    return () => window.clearTimeout(t)
  }, [state, ready])

  // 跨过零点时刷新「今天」的 key，避免页面开着过夜后天数不更新
  useEffect(() => {
    const tick = () => {
      const k = dateKeyOf()
      setTodayKey((prev) => (prev === k ? prev : k))
    }
    const timer = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const createCharacter = useCallback(
    (profile: ProfileInput) => {
      const prev = stateRef.current ?? emptyState()
      commit({ ...prev, character: buildCharacter(profile) })
    },
    [commit],
  )

  const logActivity = useCallback(
    (activityKey: string, amount: number, note?: string): ActivityOutcome => {
      const current = stateRef.current
      if (!current) return { ok: false, error: '存档尚未就绪' }
      const outcome = settleActivity(current, { activityKey, amount, note })
      if (outcome.ok) commit(outcome.state)
      return outcome
    },
    [commit],
  )

  const addTask = useCallback(
    (input: Omit<NewTaskInput, 'now'>) => {
      const current = stateRef.current
      if (!current) return
      const task = makeTask(input)
      commit({ ...current, tasks: [task, ...current.tasks] })
    },
    [commit],
  )

  const completeTask = useCallback(
    (taskId: string): TaskOutcome => {
      const current = stateRef.current
      if (!current) return { ok: false, error: '存档尚未就绪' }
      const outcome = settleTask(current, taskId)
      if (outcome.ok) commit(outcome.state)
      return outcome
    },
    [commit],
  )

  const cancelTask = useCallback(
    (taskId: string) => {
      const current = stateRef.current
      if (!current) return
      commit({
        ...current,
        tasks: current.tasks.map((t) =>
          t.id === taskId && t.state === 'pending' ? { ...t, state: 'cancelled' } : t,
        ),
      })
    },
    [commit],
  )

  const removeTask = useCallback(
    (taskId: string) => {
      const current = stateRef.current
      if (!current) return
      commit({ ...current, tasks: current.tasks.filter((t) => t.id !== taskId) })
    },
    [commit],
  )

  const updateProfile = useCallback(
    (patch: Partial<ProfileInput>) => {
      const current = stateRef.current
      if (!current?.character) return
      const ch: Character = { ...current.character }
      if (patch.name !== undefined) ch.name = patch.name.trim() || ch.name
      if (patch.age !== undefined) ch.age = patch.age
      if (patch.gender !== undefined) ch.gender = patch.gender
      if (patch.identity !== undefined) ch.identity = patch.identity
      if (patch.heightCm !== undefined) ch.heightCm = patch.heightCm
      if (patch.weightKg !== undefined) ch.weightKg = patch.weightKg
      if (patch.goals !== undefined) ch.goals = patch.goals
      commit({ ...current, character: ch })
    },
    [commit],
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const current = stateRef.current
      if (!current) return
      commit({ ...current, settings: { ...current.settings, ...patch } })
    },
    [commit],
  )

  const updateLlm = useCallback(
    (patch: Partial<LlmSettings>) => {
      const current = stateRef.current
      if (!current) return
      commit({
        ...current,
        settings: {
          ...current.settings,
          llm: { ...current.settings.llm, ...patch },
        },
      })
    },
    [commit],
  )

  const recordDispatch = useCallback(
    (record: Omit<DispatchRecord, 'id' | 'at'>) => {
      const current = stateRef.current
      if (!current) return
      const entry: DispatchRecord = {
        ...record,
        id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        at: new Date().toISOString(),
      }
      // 只保留最近 40 条，避免存档无限膨胀
      const history = [...current.dispatchHistory, entry].slice(-40)
      commit({ ...current, dispatchHistory: history })
    },
    [commit],
  )

  const exportJson = useCallback(() => {
    return JSON.stringify(stateRef.current ?? emptyState(), null, 2)
  }, [])

  const importJson = useCallback(
    (text: string): { ok: boolean; error?: string } => {
      try {
        const parsed = JSON.parse(text) as Partial<AppState>
        if (!parsed || typeof parsed !== 'object') return { ok: false, error: '不是合法的 JSON 对象' }
        if (!('character' in parsed) || !Array.isArray(parsed.logs)) {
          return { ok: false, error: '缺少必要字段（character / logs），不像是本系统的存档' }
        }
        const merged: AppState = mergeLoadedState(parsed)
        commit(merged)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : '解析失败' }
      }
    },
    [commit],
  )

  const hardReset = useCallback(async () => {
    await clearState()
    const fresh = emptyState()
    stateRef.current = fresh
    setState(fresh)
  }, [])

  const api = useMemo<GameApi>(
    () => ({
      ready,
      state,
      saveError,
      createCharacter,
      logActivity,
      addTask,
      completeTask,
      cancelTask,
      removeTask,
      updateProfile,
      updateSettings,
      updateLlm,
      recordDispatch,
      exportJson,
      importJson,
      hardReset,
      todayKey,
    }),
    [
      ready,
      state,
      saveError,
      createCharacter,
      logActivity,
      addTask,
      completeTask,
      cancelTask,
      removeTask,
      updateProfile,
      updateSettings,
      updateLlm,
      recordDispatch,
      exportJson,
      importJson,
      hardReset,
      todayKey,
    ],
  )

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame 必须在 GameProvider 内使用')
  return ctx
}

export type { Category, Difficulty }
