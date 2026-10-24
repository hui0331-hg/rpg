import { useRef, useState } from 'react'
import { BALANCE } from '../data/balance'
import { fmt } from '../core/curve'
import { testLlm } from '../ai/llm'
import { useGame } from '../state/store'

const GENDERS = ['男', '女', '其他', '不填']
const IDENTITIES = ['学生', '上班族', '自由职业', '待业 / 间隔年', '其他']

export function ProfileView() {
  const {
    state,
    updateProfile,
    updateSettings,
    updateLlm,
    exportJson,
    importJson,
    hardReset,
    saveError,
  } = useGame()
  const ch = state?.character
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  const [testing, setTesting] = useState(false)

  if (!ch || !state) return null

  const llm = state.settings.llm
  const aiReady = Boolean(llm.apiKey.trim() || llm.proxyUrl.trim())

  const runTest = async () => {
    setTesting(true)
    setAiMsg('')
    const res = await testLlm(llm)
    setAiMsg(res.ok ? '✓ 连接成功，AI 可用。' : `✗ 连接失败：${res.error}`)
    setTesting(false)
  }

  const download = () => {
    const json = exportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `个人RPG存档-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg('存档已导出。建议定期导出一份放到电脑或网盘里。')
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    const res = importJson(text)
    setMsg(res.ok ? '存档已导入，面板已更新。' : `导入失败：${res.error}`)
    if (fileRef.current) fileRef.current.value = ''
  }

  const reset = async () => {
    if (!window.confirm('确定要清空全部数据吗？这会删除角色档案、所有记录和任务，且无法撤销。\n\n建议先导出一份存档。')) {
      return
    }
    await hardReset()
  }

  const editGoals = (value: string) => {
    updateProfile({
      goals: value
        .split(/[\n,，;；]/)
        .map((g) => g.trim())
        .filter(Boolean),
    })
  }

  return (
    <>
      <div className="card">
        <div className="card-title">
          <span>个人信息</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? '收起' : '编辑'}
          </button>
        </div>

        <div className="log-item" style={{ borderBottom: 'none', paddingTop: 0 }}>
          <div className="log-head">
            <span className="log-label" style={{ fontSize: 16 }}>
              {ch.name}
            </span>
            <span className="log-time">Lv.{ch.level}</span>
          </div>
          <div className="chip-row">
            {ch.age != null && <span className="chip">{ch.age} 岁</span>}
            {ch.gender && ch.gender !== '不填' && <span className="chip">{ch.gender}</span>}
            {ch.identity && <span className="chip">{ch.identity}</span>}
            {ch.heightCm != null && <span className="chip">{ch.heightCm}cm</span>}
            {ch.weightKg != null && <span className="chip">{ch.weightKg}kg</span>}
          </div>
          {ch.goals.length > 0 && (
            <div className="chip-row">
              {ch.goals.map((g, i) => (
                <span className="chip chip-gold" key={i}>
                  🎯 {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {editing && (
          <div style={{ marginTop: 14 }}>
            <div className="field">
              <label htmlFor="pf-name">姓名 / 代号</label>
              <input
                id="pf-name"
                className="input"
                defaultValue={ch.name}
                onBlur={(e) => updateProfile({ name: e.target.value })}
                maxLength={20}
              />
            </div>
            <div className="row-2">
              <div className="field">
                <label htmlFor="pf-age">年龄</label>
                <input
                  id="pf-age"
                  className="input"
                  defaultValue={ch.age ?? ''}
                  onBlur={(e) =>
                    updateProfile({ age: e.target.value ? Number(e.target.value) : null })
                  }
                  inputMode="numeric"
                />
              </div>
              <div className="field">
                <label htmlFor="pf-gender">性别</label>
                <select
                  id="pf-gender"
                  className="select"
                  value={ch.gender}
                  onChange={(e) => updateProfile({ gender: e.target.value })}
                >
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="pf-identity">身份</label>
              <select
                id="pf-identity"
                className="select"
                value={ch.identity}
                onChange={(e) => updateProfile({ identity: e.target.value })}
              >
                {IDENTITIES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div className="row-2">
              <div className="field">
                <label htmlFor="pf-height">身高 (cm)</label>
                <input
                  id="pf-height"
                  className="input"
                  defaultValue={ch.heightCm ?? ''}
                  onBlur={(e) =>
                    updateProfile({ heightCm: e.target.value ? Number(e.target.value) : null })
                  }
                  inputMode="decimal"
                />
              </div>
              <div className="field">
                <label htmlFor="pf-weight">体重 (kg)</label>
                <input
                  id="pf-weight"
                  className="input"
                  defaultValue={ch.weightKg ?? ''}
                  onBlur={(e) =>
                    updateProfile({ weightKg: e.target.value ? Number(e.target.value) : null })
                  }
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pf-goals">目标（每行一个）</label>
              <textarea
                id="pf-goals"
                className="textarea"
                defaultValue={ch.goals.join('\n')}
                onBlur={(e) => editGoals(e.target.value)}
                placeholder="每行一个目标"
              />
            </div>
            <div className="hint-box">修改后失焦即保存。</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <span>数值规则（透明公开）</span>
        </div>
        <div className="section-gap" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          <div>
            · 同类活动当天第 1 次收益 100%，第 2 次 60%，第 3 次 30%，第 4 次 10%，第 5 次起
            0%。重复刷同一件事不会被系统认可。
          </div>
          <div>· 每日活动经验池上限 {state.settings.dailyPoolCap}，任务奖励上限 {state.settings.taskDailyCap}。</div>
          <div>
            · 连续记录加成：从第 2 天起每天 +{Math.round(BALANCE.streak.step * 100)}%，最多 +
            {Math.round(BALANCE.streak.max * 100)}%。
          </div>
          <div>· 主属性升到 Lv.{ch.core.health.level + 1} 需要 {fmt(Math.round(BALANCE.core.base * Math.pow(ch.core.health.level, BALANCE.core.exp)))} 点经验。</div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--line)',
          }}
        >
          <div>
            <div style={{ fontSize: 14 }}>连击加成</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>
              关闭后连续天数不再影响收益
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateSettings({ streakEnabled: !state.settings.streakEnabled })}
          >
            {state.settings.streakEnabled ? '已开启' : '已关闭'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span>AI 接入</span>
          <span className="chip">{aiReady ? '已配置' : '未配置 · 本地解析'}</span>
        </div>
        <p className="page-desc" style={{ marginBottom: 12 }}>
          配置后，「记录」页的一句话会被大模型解析成结构化记录。不配置也能用，只是只认常见说法。
        </p>

        <div className="field">
          <label htmlFor="ai-base">接口地址 (baseUrl)</label>
          <input
            id="ai-base"
            className="input"
            defaultValue={llm.baseUrl}
            onBlur={(e) => updateLlm({ baseUrl: e.target.value.trim() })}
            placeholder="https://api.deepseek.com"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label htmlFor="ai-model">模型</label>
          <input
            id="ai-model"
            className="input"
            defaultValue={llm.model}
            onBlur={(e) => updateLlm({ model: e.target.value.trim() })}
            placeholder="deepseek-chat"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label htmlFor="ai-key">API Key</label>
          <input
            id="ai-key"
            className="input"
            type="password"
            defaultValue={llm.apiKey}
            onBlur={(e) => updateLlm({ apiKey: e.target.value.trim() })}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="field">
          <label htmlFor="ai-proxy">代理地址（可选）</label>
          <input
            id="ai-proxy"
            className="input"
            defaultValue={llm.proxyUrl}
            onBlur={(e) => updateLlm({ proxyUrl: e.target.value.trim() })}
            placeholder="填了就走代理，Key 放服务端更安全"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <button
          type="button"
          className="btn btn-block"
          onClick={runTest}
          disabled={testing || !aiReady}
        >
          {testing ? '测试中…' : '测试连接'}
        </button>

        {aiMsg ? (
          <div className={aiMsg.startsWith('✓') ? 'hint-box ok-box' : 'warn-box'}>{aiMsg}</div>
        ) : null}

        <div className="hint-box" style={{ marginBottom: 0 }}>
          · 配置（含 Key）只存在这台设备的浏览器本地，不会上传到任何地方。<br />
          · 但浏览器直连 LLM 接口可能被 CORS 挡住。如果「测试连接」报网络被拒绝，
          就填一个代理地址，或用本地解析先用着。<br />
          · 每次解析只发送你输入的那句话 + 任务清单 + 活动词表，不含历史记录和个人档案。
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span>数据</span>
        </div>
        <div className="hint-box">
          数据只保存在这台设备的浏览器里（IndexedDB）。换手机、清缓存、卸载浏览器都会丢失，
          所以请定期导出备份。
        </div>
        <div className="section-gap">
          <button type="button" className="btn btn-block" onClick={download}>
            ⬇ 导出存档 (JSON)
          </button>
          <button
            type="button"
            className="btn btn-block"
            onClick={() => fileRef.current?.click()}
          >
            ⬆ 导入存档
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn btn-danger btn-block" onClick={reset}>
            清空全部数据
          </button>
        </div>
        {msg ? <div className="hint-box">{msg}</div> : null}
        {saveError ? <div className="warn-box">存档写入失败：{saveError}</div> : null}
      </div>

      <div className="card">
        <div className="card-title">
          <span>关于</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.8 }}>
          个人 RPG 系统 · v0.4.0（M3）
          <br />
          已完成：规则引擎 · 属性面板 · 任务面板 · 一句话记录 · 系统派发 · 7 日趋势 ·
          成就 · 长期记忆 · 周报。
          <br />
          下一步（M4）：上线 GitHub Pages、可选 APK 打包。
        </div>
      </div>
    </>
  )
}
