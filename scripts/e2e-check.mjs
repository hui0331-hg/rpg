/**
 * 端到端检查：通过 CDP 真实驱动 Edge/Chrome，走一遍核心流程。
 *
 * 前置：
 *   1. 已构建 dist 并启动静态服务（node scripts/serve.mjs 4173）
 *   2. 已启动无头浏览器：msedge --headless=new --remote-debugging-port=9222 --user-data-dir=<临时目录> http://localhost:4173/
 *
 * 用法：node scripts/e2e-check.mjs [CDP端口] [页面URL]
 *
 * 校验链路：创建角色 → 切到记录页 → 记录跑步 5km → 断言弹层出现「健康 +2」「魅力 +2」
 */
const PORT = Number(process.argv[2] ?? 9222)
const URL_MATCH = process.argv[3] ?? 'localhost:4173'

let pass = 0
let fail = 0

function ok(name, extra = '') {
  pass++
  console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`)
}
function bad(name, extra = '') {
  fail++
  console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
      const page = list.find((t) => t.type === 'page' && t.url.includes(URL_MATCH))
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      /* 浏览器还没起来 */
    }
    await sleep(250)
  }
  throw new Error(`找不到可调试页面（端口 ${PORT}）`)
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时: ${method}`))
        }
      }, 20000)
    })
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? '页面内执行出错')
    }
    return res.result.value
  }
}

/** 页面内的通用工具（注入到 window.__t） */
const HELPERS = `
window.__t = {
  norm: (s) => (s || '').replace(/\\s+/g, ' ').trim(),
  text: () => window.__t.norm(document.body.innerText),
  setInput(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  setSelect(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },
  clickByText(selector, needle) {
    const el = [...document.querySelectorAll(selector)].find((n) =>
      window.__t.norm(n.innerText).includes(needle),
    );
    if (!el) return false;
    el.click();
    return true;
  },
  waitText(needle, ms = 6000) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        if (document.body.innerText.includes(needle)) {
          clearInterval(timer);
          resolve('ok');
        } else if (Date.now() - t0 > ms) {
          clearInterval(timer);
          resolve('timeout: ' + window.__t.text().slice(0, 200));
        }
      }, 80);
    });
  },
};
'ready'
`

async function main() {
  const page = await findPage()
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const cdp = new Cdp(ws)
  await cdp.send('Runtime.enable')

  console.log('\n=== 页面加载 ===')
  const r0 = await cdp.eval(`(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      if (document.body.innerText.length > 40) return 'rendered';
      await new Promise(r => setTimeout(r, 100));
    }
    return 'blank';
  })()`)
  r0 === 'rendered' ? ok('页面已渲染') : bad('页面空白', r0)

  await cdp.eval(HELPERS)

  console.log('\n=== 创建角色 ===')
  const waitOnboard = await cdp.eval(`window.__t.waitText('角色档案')`)
  waitOnboard === 'ok' ? ok('显示角色创建引导') : bad('未进入引导页', waitOnboard)

  await cdp.eval(`window.__t.setInput(document.querySelector('#ob-name'), '天明'); 'ok'`)
  await cdp.eval(`window.__t.setInput(document.querySelector('#ob-age'), '22'); 'ok'`)
  await cdp.eval(`window.__t.setInput(document.querySelector('#ob-height'), '175'); 'ok'`)
  await cdp.eval(`window.__t.setInput(document.querySelector('#ob-weight'), '65'); 'ok'`)
  await cdp.eval(
    `window.__t.setInput(document.querySelector('#ob-goals'), '减重 5 公斤\\n一个月后过英语六级'); 'ok'`,
  )

  const clicked = await cdp.eval(`window.__t.clickByText('button', '创建角色，开始记录')`)
  clicked ? ok('点击创建角色') : bad('找不到创建按钮')

  const panel = await cdp.eval(`window.__t.waitText('主属性')`)
  panel === 'ok' ? ok('进入角色面板') : bad('未进入面板', panel)

  const panelText = await cdp.eval(`window.__t.text()`)
  panelText.includes('天明') ? ok('面板显示角色名') : bad('面板缺少角色名')
  panelText.includes('智慧') && panelText.includes('魅力') && panelText.includes('意志')
    ? ok('四大主属性齐全')
    : bad('主属性缺失')
  panelText.includes('Lv.1') ? ok('初始等级 Lv.1') : bad('等级显示异常')

  console.log('\n=== 记录跑步 5km ===')
  const toLog = await cdp.eval(`window.__t.clickByText('.tabbar button', '记录')`)
  toLog ? ok('切换到记录页') : bad('找不到记录页签')

  const logPage = await cdp.eval(`window.__t.waitText('记录一件事')`)
  logPage === 'ok' ? ok('记录页已加载') : bad('记录页未加载', logPage)

  const openRun = await cdp.eval(`window.__t.clickByText('.act-btn', '跑步')`)
  openRun ? ok('打开跑步录入弹层') : bad('找不到跑步卡片')

  const sheet = await cdp.eval(`window.__t.waitText('确认记录')`)
  sheet === 'ok' ? ok('录入弹层已展开') : bad('弹层未展开', sheet)

  // 默认 3km，步进 0.5，点 4 次 + 到 5km
  const plus = await cdp.eval(`(async () => {
    const btns = [...document.querySelectorAll('.stepper button')];
    const inc = btns[1];
    if (!inc) return 'no-button';
    for (let i = 0; i < 4; i++) inc.click();
    // 等 React 完成一次渲染再读，否则读到的是点击前的 DOM
    await new Promise((r) => setTimeout(r, 250));
    return window.__t.norm(document.querySelector('.stepper .amount').innerText);
  })()`)
  plus.startsWith('5') ? ok('数量加到 5 km', plus) : bad('数量未到 5', plus)

  const previewText = await cdp.eval(
    `window.__t.norm((document.querySelector('.gain-list') || {}).innerText || '')`,
  )
  previewText.includes('健康 +2') && previewText.includes('魅力 +2')
    ? ok('预览收益 = 健康+2 魅力+2', previewText)
    : bad('预览收益不符', previewText)

  await cdp.eval(`window.__t.clickByText('button', '确认记录'); 'ok'`)

  const done = await cdp.eval(`window.__t.waitText('结算完成')`)
  done === 'ok' ? ok('结算弹层出现') : bad('结算弹层未出现', done)

  const resultText = await cdp.eval(
    `window.__t.norm((document.querySelector('.sheet') || {}).innerText || '')`,
  )
  resultText.includes('健康 +2') && resultText.includes('魅力 +2')
    ? ok('入账收益 = 健康+2 魅力+2', resultText)
    : bad('入账收益不符', resultText)

  await cdp.eval(`window.__t.clickByText('button', '收下'); 'ok'`)
  await sleep(400)

  console.log('\n=== 面板回写 ===')
  await cdp.eval(`window.__t.clickByText('.tabbar button', '面板'); 'ok'`)
  await sleep(500)
  const panelAfter = await cdp.eval(`window.__t.text()`)
  panelAfter.includes('跑步 5km') ? ok('最近动态出现该记录') : bad('最近动态未更新')
  ;/今日经验.*?4/.test(panelAfter) || panelAfter.includes('/40')
    ? ok('今日经验已累计')
    : bad('今日经验未累计')

  console.log('\n=== 持久化（刷新后仍在） ===')
  await cdp.send('Page.enable')
  await cdp.send('Page.reload')
  await sleep(1200)
  await cdp.eval(HELPERS)
  const afterReload = await cdp.eval(`window.__t.waitText('主属性', 8000)`)
  afterReload === 'ok' ? ok('刷新后仍进入面板') : bad('刷新后数据丢失', afterReload)
  const reloadText = await cdp.eval(`window.__t.text()`)
  reloadText.includes('天明') ? ok('角色档案已持久化') : bad('角色档案丢失')
  reloadText.includes('跑步 5km') ? ok('记录已持久化') : bad('记录丢失')

  console.log('\n=== 任务流 ===')
  await cdp.eval(`window.__t.clickByText('.tabbar button', '任务'); 'ok'`)
  await cdp.eval(`window.__t.waitText('任务面板'); 'ok'`)
  await cdp.eval(`window.__t.clickByText('button', '新建任务'); 'ok'`)
  await cdp.eval(`window.__t.waitText('任务内容'); 'ok'`)
  await cdp.eval(`window.__t.setInput(document.querySelector('#task-title'), '背 20 个英语单词'); 'ok'`)
  await cdp.eval(`window.__t.clickByText('button', '创建任务'); 'ok'`)
  await sleep(400)
  const taskText = await cdp.eval(`window.__t.text()`)
  taskText.includes('背 20 个英语单词') ? ok('任务已创建') : bad('任务未创建')

  const completeBtn = await cdp.eval(`(() => {
    const row = [...document.querySelectorAll('.task-item')].find((n) =>
      n.innerText.includes('背 20 个英语单词'));
    if (!row) return 'no-row';
    const btn = [...row.querySelectorAll('.icon-btn')].find((b) => b.innerText.includes('✓'));
    if (!btn) return 'no-btn';
    btn.click();
    return 'clicked';
  })()`)
  completeBtn === 'clicked' ? ok('点击完成任务') : bad('找不到完成按钮', completeBtn)

  const taskDone = await cdp.eval(`window.__t.waitText('任务完成')`)
  taskDone === 'ok' ? ok('任务结算弹层出现') : bad('任务结算未出现', taskDone)
  const taskResult = await cdp.eval(
    `window.__t.norm((document.querySelector('.sheet') || {}).innerText || '')`,
  )
  taskResult.includes('智慧') && taskResult.includes('专注')
    ? ok('头脑类任务给智慧/专注', taskResult)
    : bad('任务收益不符', taskResult)

  console.log('\n' + '-'.repeat(52))
  console.log(`  通过 ${pass} 项，失败 ${fail} 项`)
  if (fail > 0) process.exitCode = 1
  ws.close()
}

main().catch((e) => {
  console.error('\n端到端检查失败：', e.message)
  process.exitCode = 1
})
