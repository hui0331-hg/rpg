/**
 * 结算引擎数值自测（不依赖任何测试框架，直接 node 跑）。
 *
 * 用法：
 *   node_modules/@esbuild/win32-x64/esbuild.exe scripts/test-engine.ts --bundle --platform=node --format=esm --outfile=scripts/.test-engine.mjs
 *   node scripts/.test-engine.mjs
 *
 * 校验重点：
 *  1. 方案示例「跑 5km → 健康+2 魅力+2」必须精确成立
 *  2. 同类递减 / 每日上限 / 连击加成 / 升级 / 任务奖励
 *  3. 预览与实结算必须完全一致（用户看到的就是入账的）
 */
import { BALANCE } from '../src/data/balance'
import { CORE_ORDER, SKILL_ORDER } from '../src/data/meta'
import { emptyTracks, settleActivity, settleTask, computeActivity, dateKeyOf } from '../src/core/engine'
import { makeTask } from '../src/core/tasks'
import { needXp, round1 } from '../src/core/curve'
import { parseLocalIntent } from '../src/ai/fallback'
import { normalizeIntent, type PendingTaskRef } from '../src/ai/intent'
import { resolveIntent } from '../src/ai/resolve'
import {
  buildDispatchContext,
  parseMinutesFromText,
  proposeTask,
  scoreTemplate,
  shortlist,
  TEMPLATE_MAP,
} from '../src/core/dispatch'
import { activeStreak, attributeGains, dailyPoolSeries, taskStats } from '../src/core/stats'
import {
  achievementViews,
  applyAchievements,
  computeAchievementCtx,
} from '../src/core/achievements'
import { buildMemoryDigest, memoryToPromptLines } from '../src/core/memory'
import { buildWeekReport } from '../src/core/report'
import type { AppState, Character, Grant, LogEntry } from '../src/types'

// 这个脚本跑在 Node 里，但不引入 @types/node（避免为一个字段新增依赖）。
declare const process: { exitCode?: number }

let pass = 0
let fail = 0
const failures: string[] = []

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    failures.push(`${name}\n      期望: ${e}\n      实际: ${a}`)
    console.log(`  ✗ ${name}  期望 ${e} 实际 ${a}`)
  }
}

function approx(name: string, actual: number, expected: number, eps = 0.001) {
  if (Math.abs(actual - expected) < eps) {
    pass++
    console.log(`  ✓ ${name} = ${actual}`)
  } else {
    fail++
    failures.push(`${name}  期望 ${expected} 实际 ${actual}`)
    console.log(`  ✗ ${name}  期望 ${expected} 实际 ${actual}`)
  }
}

function findGrant(grants: Grant[], key: string): number {
  const g = grants.find((x) => x.key === key)
  return g ? g.points : 0
}

function freshState(): AppState {
  const ch: Character = {
    name: '测试者',
    age: 22,
    gender: '男',
    identity: '学生',
    heightCm: 175,
    weightKg: 65,
    goals: ['减重 5kg'],
    core: emptyTracks(CORE_ORDER),
    skills: emptyTracks(SKILL_ORDER),
    level: 1,
    xp: 0,
    totalXp: 0,
    streakDays: 0,
    lastActiveDate: null,
    createdAt: new Date().toISOString(),
  }
  return {
    version: 1,
    character: ch,
    logs: [],
    tasks: [],
    settings: { ...BALANCE_SETTINGS },
    dispatchHistory: [],
    achievements: [],
  }
}

/** 构造一条假记录，用于测试成就/记忆这类「只看日志」的逻辑 */
function fakeLog(opts: {
  dateKey: string
  pool: number
  grants?: Grant[]
  activityKey?: string
  amount?: number
}): LogEntry {
  return {
    id: `fake-${opts.dateKey}-${opts.activityKey ?? 'task'}-${opts.pool}`,
    at: `${opts.dateKey}T09:00:00.000Z`,
    dateKey: opts.dateKey,
    kind: opts.activityKey ? 'activity' : 'task',
    activityKey: opts.activityKey,
    amount: opts.amount,
    todayIndex: 0,
    diminish: 1,
    streakBonus: 1,
    rawPool: opts.pool,
    pool: opts.pool,
    capped: false,
    grants: opts.grants ?? [],
    levelUps: [],
    label: opts.activityKey ?? 'task',
  }
}

const BALANCE_SETTINGS = {
  dailyPoolCap: BALANCE.dailyPoolCap,
  taskDailyCap: BALANCE.taskDailyCap,
  streakEnabled: true,
  llm: { baseUrl: '', apiKey: '', model: '', proxyUrl: '' },
}

const DAY1 = new Date(2026, 0, 10, 9, 0, 0) // 2026-01-10 09:00 本地
const DAY1_LATER = new Date(2026, 0, 10, 18, 0, 0)
const DAY2 = new Date(2026, 0, 11, 9, 0, 0)
const DAY3 = new Date(2026, 0, 12, 9, 0, 0)
const DAY5 = new Date(2026, 0, 14, 9, 0, 0)

console.log('\n=== 1. 方案示例：跑 5km → 健康+2 魅力+2 ===')
{
  const s = freshState()
  const out = settleActivity(s, { activityKey: 'run', amount: 5, now: DAY1 })
  if (!out.ok) throw new Error('结算失败：' + out.error)
  const { entry, state } = out
  approx('经验池', entry.pool, 4)
  approx('健康 +', findGrant(entry.grants, 'health'), 2)
  approx('魅力 +', findGrant(entry.grants, 'charm'), 2)
  approx('体能技能 +', findGrant(entry.grants, 'stamina'), 2.4)
  check('健康累计经验', state.character!.core.health.totalXp, 2)
  check('魅力累计经验', state.character!.core.charm.totalXp, 2)
  check('综合经验', state.character!.totalXp, 4)
  check('连击天数', state.character!.streakDays, 1)
  check('首日无连击加成', entry.streakBonus, 1)
  check('首次无递减', entry.diminish, 1)
  check('记录已写入', state.logs.length, 1)
}

console.log('\n=== 2. 同日重复记录：递减到 0 ===')
{
  let s = freshState()
  const pools: number[] = []
  const healths: number[] = []
  for (let i = 0; i < 5; i++) {
    const out = settleActivity(s, { activityKey: 'run', amount: 5, now: DAY1_LATER })
    if (!out.ok) throw new Error(out.error)
    s = out.state
    pools.push(out.entry.pool)
    healths.push(findGrant(out.entry.grants, 'health'))
  }
  check('五次经验池', pools, [4, 2.4, 1.2, 0.4, 0])
  check('五次健康收益', healths, [2, 1.2, 0.6, 0.2, 0])
  check('第 5 次记录仍留痕', s.logs.length, 5)
  check('第 5 次有解释文案', Boolean(s.logs[4].capNote), true)
}

console.log('\n=== 3. 每日经验池上限 ===')
{
  let s = freshState()
  const first = settleActivity(s, { activityKey: 'study', amount: 240, now: DAY1 })
  if (!first.ok) throw new Error(first.error)
  s = first.state
  approx('第一次学习经验池', first.entry.pool, 36)
  check('未触顶', first.entry.capped, false)

  const second = settleActivity(s, { activityKey: 'practice', amount: 240, now: DAY1_LATER })
  if (!second.ok) throw new Error(second.error)
  approx('第二次被截断到剩余额度', second.entry.pool, 4)
  check('标记为触顶', second.entry.capped, true)
  approx('当日总经验', second.state.logs.reduce((a, l) => a + l.pool, 0), BALANCE.dailyPoolCap)

  const third = settleActivity(second.state, { activityKey: 'walk', amount: 5, now: DAY1_LATER })
  if (!third.ok) throw new Error(third.error)
  approx('超出上限后为 0', third.entry.pool, 0)
  check('零收益时不给属性', third.entry.grants.length, 0)
}

console.log('\n=== 4. 连击加成（第 1 天不加，之后 +5%/天，封顶 +30%） ===')
{
  let s = freshState()
  const day1 = settleActivity(s, { activityKey: 'run', amount: 5, now: DAY1 })
  if (!day1.ok) throw new Error(day1.error)
  check('第 1 天加成', day1.entry.streakBonus, 1)
  check('第 1 天连击数', day1.state.character!.streakDays, 1)

  const day2 = settleActivity(day1.state, { activityKey: 'run', amount: 5, now: DAY2 })
  if (!day2.ok) throw new Error(day2.error)
  approx('第 2 天加成', day2.entry.streakBonus, 1.05)
  approx('第 2 天健康收益', findGrant(day2.entry.grants, 'health'), round1(2 * 1.05))
  check('第 2 天连击数', day2.state.character!.streakDays, 2)

  const day3 = settleActivity(day2.state, { activityKey: 'run', amount: 5, now: DAY3 })
  if (!day3.ok) throw new Error(day3.error)
  approx('第 3 天加成', day3.entry.streakBonus, 1.1)

  // 断签（隔一天）后连击重置
  const day5 = settleActivity(day3.state, { activityKey: 'run', amount: 5, now: DAY5 })
  if (!day5.ok) throw new Error(day5.error)
  check('断签后连击重置为 1', day5.state.character!.streakDays, 1)
  check('断签后无加成', day5.entry.streakBonus, 1)

  // 连击封顶
  let longStreak = freshState()
  longStreak.character!.streakDays = 30
  longStreak.character!.lastActiveDate = dateKeyOf(new Date(2026, 0, 9))
  const capped = settleActivity(longStreak, { activityKey: 'run', amount: 5, now: DAY1 })
  if (!capped.ok) throw new Error(capped.error)
  approx('连击加成封顶', capped.entry.streakBonus, 1 + BALANCE.streak.max)
}

console.log('\n=== 5. 升级 ===')
{
  const s = freshState()
  s.character!.core.wisdom = { level: 1, xp: needXp(1, 'core') - 1, totalXp: 59 }
  // 学习 45 分钟：池 = 6.75，智慧 0.7 → 4.7，应升级并把余数留下
  const out = settleActivity(s, { activityKey: 'study', amount: 45, now: DAY1 })
  if (!out.ok) throw new Error(out.error)
  const wisdom = out.state.character!.core.wisdom
  check('智慧升到 2 级', wisdom.level, 2)
  // 起始 59 点，差 1 点升级；升级后剩下的应等于「本次收益 − 1」
  approx(
    '升级后经验 = 溢出部分',
    wisdom.xp,
    round1(findGrant(out.entry.grants, 'wisdom') - 1),
  )
  check('产生升级事件', out.entry.levelUps.some((l) => l.label === '智慧' && l.to === 2), true)
  check('升级所需经验递增', needXp(2, 'core') > needXp(1, 'core'), true)
}

console.log('\n=== 6. 输入量夹取（防「我跑了 100 公里」） ===')
{
  const s = freshState()
  const out = settleActivity(s, { activityKey: 'run', amount: 100, now: DAY1 })
  if (!out.ok) throw new Error(out.error)
  approx('里程被夹到上限 30km', out.entry.amount ?? 0, 30)
  approx('经验池按 30km 算', out.entry.rawPool, round1(0.8 * 30))

  const tiny = settleActivity(freshState(), { activityKey: 'run', amount: 0.1, now: DAY1 })
  if (!tiny.ok) throw new Error(tiny.error)
  approx('低于步进量按步进算', tiny.entry.amount ?? 0, 0.5)
}

console.log('\n=== 7. 预览与实结算一致 ===')
{
  const s = freshState()
  const preview = computeActivity(s, 'run', 5, DAY1)
  const actual = settleActivity(s, { activityKey: 'run', amount: 5, now: DAY1 })
  if (!preview.ok || !actual.ok) throw new Error('预览或结算失败')
  check('预览收益 = 入账收益', preview.grants, actual.entry.grants)
  approx('预览经验池 = 入账经验池', preview.pool, actual.entry.pool)
}

console.log('\n=== 8. 任务奖励与任务上限 ===')
{
  let s = freshState()
  const task = makeTask({ title: '背 20 个单词', category: 'mind', difficulty: 2, now: DAY1 })
  s = { ...s, tasks: [task] }
  const out = settleTask(s, task.id, DAY1)
  if (!out.ok) throw new Error(out.error)
  approx('任务奖励池（难度2）', out.entry.pool, 6)
  approx('智慧 +', findGrant(out.entry.grants, 'wisdom'), 3.6)
  approx('专注 +', findGrant(out.entry.grants, 'focus'), 2.4)
  check('任务状态变为 done', out.task.state, 'done')
  check('重复完成被拒绝', (settleTask(out.state, task.id, DAY1) as { ok: boolean }).ok, false)

  // 任务每日上限 30：第 4 个难度 3 任务应被截断
  let s2 = freshState()
  const tasks = [1, 2, 3, 4].map((i) =>
    makeTask({ title: `挑战任务${i}`, category: 'body', difficulty: 3, now: DAY1 }),
  )
  s2 = { ...s2, tasks }
  let lastPool = 0
  for (const t of tasks) {
    const r = settleTask(s2, t.id, DAY1)
    if (!r.ok) throw new Error(r.error)
    s2 = r.state
    lastPool = r.entry.pool
  }
  approx('第 4 个任务被截断到 0', lastPool, 0)
  approx('任务当日总奖励 = 上限', s2.logs.reduce((a, l) => a + l.pool, 0), BALANCE.taskDailyCap)
}

console.log('\n=== 9. 属性不会因为零收益事件而变化 ===')
{
  const s = freshState()
  const before = JSON.stringify(s.character!.core)
  const out = settleActivity(
    { ...s, settings: { ...s.settings, dailyPoolCap: 0 } },
    { activityKey: 'run', amount: 5, now: DAY1 },
  )
  if (!out.ok) throw new Error(out.error)
  check('核心属性未变', JSON.stringify(out.state.character!.core), before)
}

console.log('\n=== 10. 本地关键词解析（无 AI 兜底） ===')
{
  const one = (text: string, pending: PendingTaskRef[] = [], goals: string[] = []) =>
    parseLocalIntent(text, pending, goals)

  const itemsOf = (text: string): unknown => {
    const it = one(text)
    return it.type === 'log' ? it.items : it.type
  }

  check('跑 5 公里 → 跑步', itemsOf('我刚刚跑了 5 公里'), [{ activityKey: 'run', amount: 5 }])
  check('跑了 5km → 跑步', itemsOf('跑了 5km'), [{ activityKey: 'run', amount: 5 }])
  check('背 20 个单词', itemsOf('背了 20 个单词'), [{ activityKey: 'words', amount: 20 }])
  check('学习 45 分钟', itemsOf('学习 45 分钟'), [{ activityKey: 'study', amount: 45 }])
  check('阅读 20 页', itemsOf('阅读了 20 页'), [{ activityKey: 'read', amount: 20 }])
  check('跑步 30 分钟 → 有氧', itemsOf('跑步 30 分钟'), [{ activityKey: 'cardio', amount: 30 }])
  check('健身 40 分钟', itemsOf('健身 40 分钟'), [{ activityKey: 'workout', amount: 40 }])
  check('1.5 小时学习 → 90 分钟', itemsOf('学习了 1.5 小时'), [{ activityKey: 'study', amount: 90 }])
  check('500 米 → 0.5 公里', itemsOf('跑了 500 米'), [{ activityKey: 'run', amount: 0.5 }])
  check('做饭（无数量）', itemsOf('中午自己做饭'), [{ activityKey: 'cook', amount: 1 }])
  check('早睡（无数量）', itemsOf('今天早睡了'), [{ activityKey: 'sleep', amount: 1 }])
  check(
    '一句话两件事',
    itemsOf('跑了 5 公里，还背了 20 个单词'),
    [
      { activityKey: 'run', amount: 5 },
      { activityKey: 'words', amount: 20 },
    ],
  )
  check('闲聊不误判', one('今天天气不错').type, 'chat')

  const req = one('给我发布一个任务', [], ['减重 5 公斤'])
  check('要求派任务 → request_task', req.type, 'request_task')
  if (req.type === 'request_task') {
    check('按目标猜成身体类', req.category, 'body')
    check('给出具体任务', req.title.length > 0, true)
  }

  const pending: PendingTaskRef[] = [
    { id: 't1', title: '背 20 个英语单词', category: 'mind', difficulty: 2 },
  ]
  const done = one('完成背单词任务', pending)
  check('说法不完全一致也能匹配任务', done.type, 'complete_task')
  if (done.type === 'complete_task') check('匹配到正确任务', done.taskId, 't1')
}

console.log('\n=== 11. AI 输出校验（模型输出一律当不可信数据） ===')
{
  const pending: PendingTaskRef[] = [
    { id: 't9', title: '背 20 个英语单词', category: 'mind', difficulty: 2 },
  ]

  const good = normalizeIntent(
    { intent: 'log', reply: '好的', items: [{ activity_key: 'run', amount: '5' }] },
    pending,
  )
  check('字符串数字被转换', good.ok && good.intent.type === 'log' ? good.intent.items : good, [
    { activityKey: 'run', amount: 5 },
  ])

  const unknownKey = normalizeIntent(
    { intent: 'log', items: [{ activity_key: 'hack_the_planet', amount: 100 }] },
    pending,
  )
  check(
    '未知活动类型被丢弃后回退成闲聊',
    unknownKey.ok && unknownKey.intent.type,
    'chat',
  )

  const huge = normalizeIntent(
    { intent: 'log', items: [{ activity_key: 'run', amount: 9999 }] },
    pending,
  )
  check('超量被夹到上限 30km', huge.ok && huge.intent.type === 'log' ? huge.intent.items[0].amount : 0, 30)

  const notJson = normalizeIntent('我拒绝输出 JSON', pending)
  check('非对象直接拒绝', notJson.ok, false)

  const complete = normalizeIntent({ intent: 'complete_task', task_id: 't9' }, pending)
  check(
    '完成任务 id 命中',
    complete.ok && complete.intent.type === 'complete_task' ? complete.intent.taskId : null,
    't9',
  )

  const badTask = normalizeIntent({ intent: 'complete_task', task_id: '不存在' }, pending)
  check('不存在的任务不误完成', badTask.ok && badTask.intent.type, 'chat')

  const taskReq = normalizeIntent({ intent: 'request_task', task: { title: '跑 1 公里' } }, pending)
  check(
    '任务缺省值补齐',
    taskReq.ok && taskReq.intent.type === 'request_task'
      ? { c: taskReq.intent.category, d: taskReq.intent.difficulty }
      : null,
    { c: 'mind', d: 2 },
  )
}


console.log('\n=== 12. 解析总入口（未配置 Key 时自动走本地）===')
{
  const st = freshState()
  const out = await resolveIntent(st, '我刚刚跑了 5 公里')
  check('未配置 Key → source=local', out.source, 'local')
  check('仍能解析成 log', out.intent?.type, 'log')
  if (out.intent?.type === 'log') {
    check('解析出跑步 5 公里', out.intent.items, [{ activityKey: 'run', amount: 5 }])
  }

  const empty = await resolveIntent(st, '   ')
  check('空输入被拒绝', empty.ok, false)

  const chat = await resolveIntent(st, '今天有点累')
  check('闲聊走 chat', chat.intent?.type, 'chat')
}

console.log('\n=== 13. 任务派发引擎 ===')
{
  check('「只有 10 分钟」→ 10', parseMinutesFromText('我只有 10 分钟'), 10)
  check('「要上课」→ 10', parseMinutesFromText('我等会儿要去上课'), 10)
  check('「半小时」→ 30', parseMinutesFromText('有半小时空'), 30)
  check('「一整个下午」→ 60', parseMinutesFromText('一整个下午都有空'), 60)
  check('没说时间 → null', parseMinutesFromText('给我安排一下'), null)

  // 场景 1：碎片时间
  const base = freshState()
  const tight = buildDispatchContext(base, DAY1, '我只有 10 分钟')
  check('上下文记录可用时间', tight.minutesAvailable, 10)
  const pTight = proposeTask(tight)!
  check('碎片时间只推短任务', pTight.minutes <= 15, true)
  check('确实是 quick 模板', TEMPLATE_MAP[pTight.templateId].tag, 'quick')

  // 场景 2：整块时间
  const loose = buildDispatchContext(base, DAY1, '一整个下午都有空')
  const pLoose = proposeTask(loose)!
  check('整块时间会给更长的任务', pLoose.minutes >= 20, true)

  // 场景 3：拒绝过的任务不再推
  const rejectedCtx = {
    ...tight,
    rejectedTitles: [pTight.title],
  }
  const pAfterReject = proposeTask(rejectedCtx)!
  check('拒绝过的不再推荐', pAfterReject.templateId !== pTight.templateId, true)

  // 场景 4：显式排除（换一个）
  const pSwap = proposeTask(tight, { excludeTemplateIds: [pTight.templateId] })!
  check('排除后换到另一个模板', pSwap.templateId !== pTight.templateId, true)
  const pSwap2 = proposeTask(tight, {
    excludeTemplateIds: [pTight.templateId, pSwap.templateId],
  })!
  check('可以连续换', ![pTight.templateId, pSwap.templateId].includes(pSwap2.templateId), true)

  // 场景 5：今天已经跑过 → 再推跑步类会降分
  const ranOut = settleActivity(base, { activityKey: 'run', amount: 5, now: DAY1 })
  if (!ranOut.ok) throw new Error(ranOut.error)
  const ranCtx = buildDispatchContext(ranOut.state, DAY1, '')
  const runNoRun = scoreTemplate(TEMPLATE_MAP['d-run3'], buildDispatchContext(base, DAY1, ''))
  const runAfter = scoreTemplate(TEMPLATE_MAP['d-run3'], ranCtx)
  check('今天已运动 → 运动类任务降分', runAfter.score < runNoRun.score, true)

  // 场景 6：短板驱动 —— 只练过身体，应优先补头脑
  const stretch = settleActivity(base, { activityKey: 'stretch', amount: 15, now: DAY1 })
  if (!stretch.ok) throw new Error(stretch.error)
  const weakCtx = buildDispatchContext(stretch.state, DAY1, '我只有 10 分钟')
  check('识别出短板属性', weakCtx.weakest !== null, true)
  const pWeak = proposeTask(weakCtx)!
  const boosts = TEMPLATE_MAP[pWeak.templateId].boosts
  check('推荐命中了短板方向', boosts.includes(weakCtx.weakest!), true)

  // 场景 7：候选池是有限且可解释的
  const list = shortlist(tight, 5)
  check('候选数量', list.length, 5)
  check('候选按分数降序', list[0].score >= list[4].score, true)
  check('每个候选都有理由', list.every((c) => c.reason.length > 0), true)

  // 场景 8：时间硬约束（AI 层也会校验，这里测规则层）
  const p30 = proposeTask(buildDispatchContext(base, DAY1, '30 分钟'))
  check('30 分钟不会推 60 分钟的任务', p30!.minutes <= 45, true)
}

console.log('\n=== 14. 多日趋势统计 ===')
{
  let s = freshState()
  const d2 = new Date(2026, 0, 9, 9, 0, 0)
  const a = settleActivity(s, { activityKey: 'run', amount: 5, now: d2 })
  if (!a.ok) throw new Error(a.error)
  s = a.state
  const b = settleActivity(s, { activityKey: 'study', amount: 45, now: DAY1 })
  if (!b.ok) throw new Error(b.error)
  s = b.state

  const series = dailyPoolSeries(s, 7, DAY1)
  check('返回 7 天', series.length, 7)
  check('最后一天是今天', series[6].label, '今天')
  // 第二天已触发连击：6.75 × 1.05 = 7.1
  approx('今天经验池（含连击加成）', series[6].pool, 7.1)
  approx('昨天经验池', series[5].pool, 4)
  approx('7 日合计', series.reduce((x, p) => x + p.pool, 0), 11.1)
  check('活跃天数', series.filter((p) => p.logs > 0).length, 2)

  const gains = attributeGains(s, 7, DAY1)
  check('属性增长按降序', gains[0].points >= gains[3].points, true)
  approx('健康累计增长', gains.find((g) => g.key === 'health')!.points, 2)
  approx('智慧累计增长', gains.find((g) => g.key === 'wisdom')!.points, 5)

  const tasks = [1, 2].map((i) =>
    makeTask({ title: `趋势任务${i}`, category: 'mind', difficulty: 1, now: DAY1 }),
  )
  let s3 = { ...s, tasks }
  const done = settleTask(s3, tasks[0].id, DAY1)
  if (!done.ok) throw new Error(done.error)
  s3 = done.state
  const ts = taskStats(s3, 7, DAY1)
  check('任务统计 done', ts.done, 1)
  check('完成率 100%', Math.round((ts.rate ?? 0) * 100), 100)

  check('连续活跃天数（只算到今天/昨天为止）', activeStreak(s3, DAY1), 2)
}

console.log('\n=== 17. 成就系统 ===')
{
  const empty = freshState()
  const none = applyAchievements(empty, DAY1)
  check('空白存档不解锁任何成就', none.unlocked.length, 0)

  const one = settleActivity(empty, { activityKey: 'run', amount: 5, now: DAY1 })
  if (!one.ok) throw new Error(one.error)
  check('第一条记录解锁「初次落笔」', one.entry.achievements, ['first-log'])
  check('成就写入存档', one.state.achievements.map((a) => a.id), ['first-log'])
  check('解锁时间已记录', Boolean(one.state.achievements[0].unlockedAt), true)

  const second = settleActivity(one.state, { activityKey: 'study', amount: 30, now: DAY1 })
  if (!second.ok) throw new Error(second.error)
  check('已解锁的不会重复添加', second.state.achievements.length, 1)
  check('第二条记录不再产生成就', second.entry.achievements, undefined)

  // 连续 3 天 → 三日之约
  let streakState: AppState = freshState()
  let lastStreakEntry: string[] | undefined
  for (let i = 0; i < 3; i++) {
    const day = new Date(2026, 0, 10 + i, 9, 0, 0)
    const r = settleActivity(streakState, { activityKey: 'run', amount: 5, now: day })
    if (!r.ok) throw new Error(r.error)
    streakState = r.state
    lastStreakEntry = r.entry.achievements
  }
  check('连续 3 天解锁「三日之约」', lastStreakEntry?.includes('streak-3'), true)
  check('前三天不应解锁一周成就', streakState.achievements.some((a) => a.id === 'streak-7'), false)

  // 累计里程与经验（用构造日志测，避免受每日上限影响）
  const runHeavy: AppState = {
    ...freshState(),
    logs: [
      fakeLog({ dateKey: '2026-01-10', pool: 20, activityKey: 'run', amount: 15 }),
      fakeLog({ dateKey: '2026-01-11', pool: 20, activityKey: 'run', amount: 15 }),
    ],
  }
  const runAch = applyAchievements(runHeavy, DAY1)
  const runIds = runAch.unlocked.map((a) => a.id)
  check('累计 30 公里解锁「跑者」', runIds.includes('run-20'), true)
  check('未到 100 公里不解锁「长跑者」', runIds.includes('run-100'), false)

  const xpHeavy: AppState = {
    ...freshState(),
    logs: [
      fakeLog({ dateKey: '2026-01-10', pool: 50 }),
      fakeLog({ dateKey: '2026-01-11', pool: 50 }),
      fakeLog({ dateKey: '2026-01-12', pool: 50 }),
    ],
  }
  const xpAch = applyAchievements(xpHeavy, DAY1)
  check('累计 150 点解锁「百点积累」', xpAch.unlocked.some((a) => a.id === 'xp-100'), true)

  const ctx = computeAchievementCtx(runHeavy)
  check('派生统计：总经验', ctx.totalXp, 40)
  check('派生统计：跑步里程', ctx.runKm, 30)
  check('派生统计：活跃天数', ctx.logDays, 2)

  const views = achievementViews(one.state)
  check('视图覆盖全部成就', views.length >= 16, true)
  check('已解锁排在最前', views[0].unlocked, true)
  const lockedView = views.find((v) => !v.unlocked)!
  check('未解锁的有进度比例', lockedView.ratio >= 0 && lockedView.ratio < 1, true)
}

console.log('\n=== 18. 长期记忆摘要 ===')
{
  const logs: LogEntry[] = []
  for (let i = 0; i < 6; i++) {
    const day = `2026-01-${String(10 + i).padStart(2, '0')}`
    logs.push(
      fakeLog({
        dateKey: day,
        pool: 0.8,
        activityKey: 'words',
        amount: 20,
        grants: [{ kind: 'skill', key: 'english', points: 0.6 }],
      }),
    )
  }
  const st: AppState = { ...freshState(), logs }

  const digest = buildMemoryDigest(st, new Date(2026, 0, 15, 9, 0, 0))
  check('统计到活跃天数', digest.daysLogged, 6)
  check('统计到总记录数', digest.totalLogs, 6)
  check('识别出稳定习惯', digest.habits, ['背单词'])
  check('识别出常做项目', digest.topActivities[0].name, '背单词')
  check('识别出停滞属性（含健康）', digest.stale.includes('健康'), true)
  check('最长连击计算正确', digest.longestStreak, 6)

  const lines = memoryToPromptLines(digest)
  check('摘要包含习惯行', lines.includes('稳定习惯：背单词'), true)
  check('摘要包含停滞行', lines.includes('明显停滞'), true)
  check('摘要行数可控', lines.split('\n').length <= 10, true)

  // 最后一条记录就是「今天」→ 应为已记录；换到 5 天后则应为未记录
  check('当天有记录时标记为 true', digest.todayLogged, true)
  const later = buildMemoryDigest(st, new Date(2026, 0, 20, 9, 0, 0))
  check('隔了几天未记录 → false', later.todayLogged, false)
}

console.log('\n=== 19. 周报 ===')
{
  let s = freshState()
  const a = settleActivity(s, { activityKey: 'run', amount: 5, now: DAY1 })
  if (!a.ok) throw new Error(a.error)
  s = a.state
  const b = settleActivity(s, { activityKey: 'words', amount: 20, now: DAY1_LATER })
  if (!b.ok) throw new Error(b.error)
  s = b.state

  const report = buildWeekReport(s, DAY1)
  check('周期 7 天', report.periodStart, '2026-01-04')
  check('周期结束于今天', report.periodEnd, '2026-01-10')
  approx('周报总经验', report.totalPool, 4.8)
  check('活跃天数', report.activeDays, 1)
  check('最常做活动', report.topActivity?.name, '跑步')
  check('Markdown 含标题', report.markdown.includes('# 个人 RPG 周报'), true)
  check('Markdown 含属性表', report.markdown.includes('| 健康 |'), true)
  check('单日活跃时给出保守建议', report.suggestion.includes('只有 1 天'), true)

  const emptyReport = buildWeekReport(freshState(), DAY1)
  check('零数据周报不崩', emptyReport.totalPool, 0)
  check('零数据建议是「先开始」', emptyReport.suggestion.includes('还没开始'), true)
  check('零数据 headline 明确', emptyReport.headline, '这一周没有留下记录')
}

console.log('\n' + '-'.repeat(52))
console.log(`  通过 ${pass} 项，失败 ${fail} 项`)
if (fail > 0) {
  console.log('\n失败明细：')
  for (const f of failures) console.log('  · ' + f)
  process.exitCode = 1
} else {
  console.log('  数值引擎全部符合预期 ✓')
}
