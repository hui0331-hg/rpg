/**
 * LLM 转发代理（Cloudflare Worker）—— 可选组件
 *
 * 用途：浏览器直连 LLM 接口可能被 CORS 挡住，且把 API Key 放前端不安全。
 * 部署本 Worker 后，App 里「AI 接入 → 代理地址」填它的 URL，Key 留在服务端。
 *
 * 部署步骤：
 *   1. Cloudflare Dashboard → Workers & Pages → 创建 Worker
 *   2. 把本文件内容粘进去（或 `wrangler deploy`）
 *   3. 设置环境变量 DEEPSEEK_API_KEY = 你的 Key
 *      （wrangler:  `wrangler secret put DEEPSEEK_API_KEY`）
 *   4. 可选：把 ALLOWED_ORIGINS 改成你的站点地址，收紧跨域
 *
 * 请求契约（与 src/ai/llm.ts 对齐）：
 *   POST <worker-url>
 *   body: { model, messages, temperature, max_tokens, response_format }
 *   resp: 与 OpenAI chat/completions 完全一致的 JSON
 */

const UPSTREAM = 'https://api.deepseek.com/chat/completions'

// 建议改成你自己的站点，例如 'https://yourname.github.io'
const ALLOWED_ORIGINS = '*'

function corsHeaders(origin) {
  const allow =
    ALLOWED_ORIGINS === '*'
      ? '*'
      : ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin)
        ? origin
        : 'null'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? ''
    const cors = corsHeaders(origin)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors })
    }

    if (!env.DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: 'Worker 未配置 DEEPSEEK_API_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    let payload
    try {
      payload = await request.json()
    } catch {
      return new Response(JSON.stringify({ error: '请求体不是合法 JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
      })
    }

    // 只透传白名单字段，避免被当成任意请求转发器
    const body = {
      model: payload.model || 'deepseek-chat',
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.2,
      max_tokens: typeof payload.max_tokens === 'number' ? payload.max_tokens : 800,
      response_format: payload.response_format || { type: 'json_object' },
    }

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
    })
  },
}
