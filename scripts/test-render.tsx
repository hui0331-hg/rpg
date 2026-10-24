/**
 * 渲染冒烟测试 —— 用 react-dom/server 把每个视图真渲染一遍。
 *
 * 为什么需要它：类型检查只能保证「形状对」，保证不了「运行时不会炸」。
 * 组件里少个判空、hooks 用错位置，打包一样过、打开就是白屏。
 * 这里在 Node 里做真实渲染，能在不启动浏览器的情况下拦住这类问题。
 *
 * 局限：只验证「首帧能渲染出预期内容」，交互与样式仍需人工看。
 */
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { CORE_ORDER, SKILL_ORDER } from '../src/data/meta'
import { emptyTracks, settleActivity, dateKeyOf } from '../src/core/engine'
import { makeTask } from '../src/core/tasks'
import { GameContext, type GameApi } from '../src/state/store'
import { STATE_VERSION } from '../src/state/store'
import { PanelView } from '../src/ui/PanelView'
import { LogView } from '../src/ui/LogView'
import { TasksView } from '../src/ui/TasksView'
import { ProfileView } from '../src/ui/ProfileView'
import { AiBar } from '../src/ui/AiBar'
import { DispatchCard } from '../src/ui/DispatchCard'
import { TrendCard } from '../src/ui/TrendCard'
import { AchievementsCard } from '../src/ui/AchievementsCard'
import { ReportView } from '../src/ui/ReportView'
import { Onboarding } from '../src/ui/Onboarding'
import type { AppState, Character } from '../src/types'

declare const process: { exitCode?: number }

let pass = 0
let fail = 0

function ok(name: string) {
  pass++
  console.log(`  ✓ ${name}`)
}
function bad(name: string, err: unknown) {
  fail++
  console.log(`  ✗ ${name} — ${err instanceof Error ? err.message : String(err)}`)
}

/* ------------------------- 构造测试用状态 ------------------------- */

function buildState(withData: boolean): AppState {
  const character: Character = {
    name: '天明',
    age: 22,
    gender: '男',
    identity: '学生',
    heightCm: 175,
    weightKg: 65,
    goals: ['减重 5 公斤', '一个月后过英语六级'],
    core: emptyTracks(CORE_ORDER),
    skills: emptyTracks(SKILL_ORDER),
    level: 1,
    xp: 0,
    totalXp: 0,
    streakDays: 0,
    lastActiveDate: null,
    createdAt: new Date().toISOString(),
  }

  const base: AppState = {
    version: STATE_VERSION,
    character,
    logs: [],
    tasks: [],
    settings: {
      dailyPoolCap: 40,
      taskDailyCap: 30,
      streakEnabled: true,
      llm: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat', proxyUrl: '' },
    },
    dispatchHistory: [],
    achievements: [],
  }

  if (!withData) return base

  let s = base
  const run = settleActivity(s, { activityKey: 'run', amount: 5 })
  if (run.ok) s = run.state
  const study = settleActivity(s, { activityKey: 'study', amount: 45 })
  if (study.ok) s = study.state

  const task = makeTask({ title: '背 20 个英语单词', category: 'mind', difficulty: 2 })
  return {
    ...s,
    tasks: [task],
    dispatchHistory: [
      {
        id: 'd1',
        at: new Date().toISOString(),
        title: '跑步 3 公里',
        action: 'rejected',
        templateId: 'd-run3',
      },
    ],
  }
}

function makeApi(state: AppState): GameApi {
  const noop = () => {}
  return {
    ready: true,
    state,
    saveError: null,
    createCharacter: noop,
    logActivity: () => ({ ok: false, error: '测试环境不执行结算' }),
    addTask: noop,
    completeTask: () => ({ ok: false, error: '测试环境不执行结算' }),
    cancelTask: noop,
    removeTask: noop,
    updateProfile: noop,
    updateSettings: noop,
    updateLlm: noop,
    recordDispatch: noop,
    exportJson: () => '{}',
    importJson: () => ({ ok: true }),
    hardReset: async () => {},
    todayKey: dateKeyOf(),
  } as unknown as GameApi
}

function renderView(name: string, el: React.ReactElement, mustContain: string[]) {
  try {
    const html = renderToString(
      createElement(GameContext.Provider, { value: makeApi(buildState(true)) }, el),
    )
    if (!html || html.length < 40) {
      bad(name, new Error(`输出过短（${html.length} 字节），可能是空渲染`))
      return
    }
    const missing = mustContain.filter((t) => !html.includes(t))
    if (missing.length > 0) {
      bad(name, new Error(`缺少预期内容：${missing.join(' / ')}`))
      return
    }
    ok(`${name}（${html.length} 字节）`)
  } catch (e) {
    bad(name, e)
  }
}

console.log('\n=== 15. 视图渲染冒烟测试 ===')

renderView('面板视图', createElement(PanelView), ['天明', '主属性', '智慧', '最近 7 天'])
renderView('记录视图', createElement(LogView), ['记录一件事', '今天做了什么', '说一句话'])
renderView('任务视图', createElement(TasksView), ['让系统安排', '任务面板', '背 20 个英语单词'])
renderView('档案视图', createElement(ProfileView), ['个人信息', 'AI 接入', '数值规则', '导出存档'])
renderView('一句话输入', createElement(AiBar), ['交给系统解析'])
renderView('派发卡片', createElement(DispatchCard), ['让系统安排', '给我安排今天的事'])
renderView('趋势卡片', createElement(TrendCard), ['最近 7 天', '7 日总经验'])
renderView('成就卡片', createElement(AchievementsCard), ['成就', '初次落笔', '已解锁'])
renderView('周报视图', createElement(ReportView), ['最近 7 天周报', '下周建议', '系统记得的你'])
renderView('引导页', createElement(Onboarding), ['个人 RPG 系统', '创建角色，开始记录'])

console.log('\n=== 16. 空数据也要能渲染（新用户第一次打开）===')
{
  const empty = buildState(false)
  try {
    const html = renderToString(
      createElement(GameContext.Provider, { value: makeApi(empty) }, createElement(PanelView)),
    )
    if (html.includes('主属性') && html.includes('天明')) {
      ok('零记录状态下面板正常渲染')
    } else {
      bad('零记录状态下面板正常渲染', new Error('内容缺失'))
    }
  } catch (e) {
    bad('零记录状态下面板正常渲染', e)
  }

  try {
    const html = renderToString(
      createElement(GameContext.Provider, { value: makeApi(empty) }, createElement(LogView)),
    )
    if (html.includes('记录一件事')) ok('零记录状态下记录视图正常渲染')
    else bad('零记录状态下记录视图正常渲染', new Error('内容缺失'))
  } catch (e) {
    bad('零记录状态下记录视图正常渲染', e)
  }
}

console.log('\n' + '-'.repeat(52))
console.log(`  渲染通过 ${pass} 项，失败 ${fail} 项`)
if (fail > 0) process.exitCode = 1
