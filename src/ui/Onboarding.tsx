import { useState } from 'react'
import { useGame } from '../state/store'

const GENDERS = ['男', '女', '其他', '不填']
const IDENTITIES = ['学生', '上班族', '自由职业', '待业 / 间隔年', '其他']

function parseNum(v: string): number | null {
  if (!v.trim()) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function Onboarding() {
  const { createCharacter } = useGame()
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('不填')
  const [identity, setIdentity] = useState('学生')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [goals, setGoals] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (!name.trim()) {
      setError('先告诉我怎么称呼你 —— 名字是面板的第一格。')
      return
    }
    const goalList = goals
      .split(/[\n,，;；]/)
      .map((g) => g.trim())
      .filter(Boolean)

    createCharacter({
      name,
      age: parseNum(age),
      gender,
      identity,
      heightCm: parseNum(height),
      weightKg: parseNum(weight),
      goals: goalList,
    })
  }

  return (
    <div className="onboard">
      <div className="onboard-logo">
        <div className="logo-glyph float-tip">✦</div>
        <h1>个人 RPG 系统</h1>
        <p>
          把你的日常，练成面板数值。
          <br />
          系统不会替你努力，但会替你记着每一分。
        </p>
      </div>

      <div className="card">
        <div className="card-title">
          <span>角色档案</span>
          <span className="chip chip-gold">第一步</span>
        </div>

        <div className="field">
          <label htmlFor="ob-name">姓名 / 代号 *</label>
          <input
            id="ob-name"
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            placeholder="例如：天明"
            maxLength={20}
            autoComplete="off"
          />
        </div>

        <div className="row-2">
          <div className="field">
            <label htmlFor="ob-age">年龄</label>
            <input
              id="ob-age"
              className="input"
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="例 22"
              inputMode="numeric"
              maxLength={3}
            />
          </div>
          <div className="field">
            <label htmlFor="ob-gender">性别</label>
            <select
              id="ob-gender"
              className="select"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
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
          <label htmlFor="ob-identity">身份</label>
          <select
            id="ob-identity"
            className="select"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
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
            <label htmlFor="ob-height">身高 (cm)</label>
            <input
              id="ob-height"
              className="input"
              value={height}
              onChange={(e) => setHeight(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="例 175"
              inputMode="decimal"
              maxLength={5}
            />
          </div>
          <div className="field">
            <label htmlFor="ob-weight">体重 (kg)</label>
            <input
              id="ob-weight"
              className="input"
              value={weight}
              onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="例 65"
              inputMode="decimal"
              maxLength={5}
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 6 }}>
          <label htmlFor="ob-goals">当前目标（每行一个，可留空）</label>
          <textarea
            id="ob-goals"
            className="textarea"
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder={'减重 5 公斤\n一个月后过英语六级\n每周跑步 3 次'}
            maxLength={300}
          />
        </div>

        {error ? <div className="warn-box">{error}</div> : null}

        <button type="button" className="btn btn-primary btn-block" onClick={submit}>
          创建角色，开始记录
        </button>
      </div>

      <div className="hint-box">
        这些信息只存在你自己的设备上，不会上传到任何服务器。之后可以随时在「档案」里修改。
      </div>
    </div>
  )
}
