/**
 * LLM 调用层（OpenAI 兼容协议）。
 *
 * 两种模式：
 * - 直连：浏览器 → https://api.deepseek.com/chat/completions（带 Bearer Key）
 * - 代理：浏览器 → 你的 worker（Key 放服务端），用于绕开 CORS / 避免 Key 落浏览器
 *
 * 注意：这里发出的请求只包含「用户这句话 + 任务清单 + 活动词表」，
 * 不含任何身份信息、历史记录或存档。
 */
import type { LlmSettings } from '../types'

export type LlmResult = { ok: true; content: string } | { ok: false; error: string }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const TIMEOUT_MS = 30_000

function describeHttpError(status: number, body: string): string {
  const snippet = body.slice(0, 200)
  if (status === 401 || status === 403) return `API Key 无效或无权限（HTTP ${status}）`
  if (status === 402) return '账户余额不足（HTTP 402）'
  if (status === 404) return `接口地址不存在，检查 baseUrl / model（HTTP 404）：${snippet}`
  if (status === 429) return '请求太频繁或额度用尽（HTTP 429）'
  if (status >= 500) return `服务端错误（HTTP ${status}）：${snippet}`
  return `请求失败（HTTP ${status}）：${snippet}`
}

export async function callLlm(
  cfg: LlmSettings,
  messages: ChatMessage[],
): Promise<LlmResult> {
  const useProxy = Boolean(cfg.proxyUrl.trim())
  const hasKey = Boolean(cfg.apiKey.trim())

  if (!useProxy && !hasKey) {
    return { ok: false, error: '还没有配置 API Key' }
  }

  let url: string
  let headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const body: Record<string, unknown> = {
    model: cfg.model.trim() || 'deepseek-chat',
    messages,
    temperature: 0.2,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  }

  if (useProxy) {
    url = cfg.proxyUrl.trim()
  } else {
    const base = cfg.baseUrl.trim().replace(/\/+$/, '')
    url = `${base}/chat/completions`
    headers = { ...headers, Authorization: `Bearer ${cfg.apiKey.trim()}` }
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: describeHttpError(res.status, text) }
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = json.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, error: '接口返回内容为空' }
    }
    return { ok: true, content }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: `请求超时（${TIMEOUT_MS / 1000}s）` }
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return {
        ok: false,
        error:
          '网络请求被拒绝。常见原因：①接口不允许浏览器直连（CORS）②离线。可改用代理地址，或先用本地解析。',
      }
    }
    return { ok: false, error: msg }
  } finally {
    window.clearTimeout(timer)
  }
}

/** 从可能带 ```json 包裹的文本里抠出 JSON 对象 */
export function extractJson(content: string): unknown {
  const trimmed = content.trim()
  const candidates: string[] = [trimmed]

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))

  for (const c of candidates) {
    try {
      return JSON.parse(c)
    } catch {
      /* 试下一个 */
    }
  }
  return null
}

/** 连通性测试：发一句最小请求，确认 Key / 地址可用 */
export async function testLlm(cfg: LlmSettings): Promise<LlmResult> {
  return callLlm(cfg, [
    { role: 'system', content: '你是连通性测试助手。只输出 JSON：{"ok":true}' },
    { role: 'user', content: 'ping' },
  ])
}
