// ============================================
// Agnes-2.0-Flash 文本适配器（真实 API）
// JSON 策略: prompt_only (schema 嵌入 prompt, 不使用 response_format)
// Agnes API 不保证支持 OpenAI 的 json_object mode，改用 prompt_only 与 Ark 保持一致
// ============================================
import { BaseTextAdapter, createAdapterError } from '../base.adapter'
import { TextGenerationRequest, TextGenerationResponse } from '../types'

export interface AgnesTextAdapterConfig {
  model: string
  apiKey: string
  baseUrl: string
}

const DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
const DEFAULT_MODEL = 'agnes-2.0-flash'

export class AgnesTextAdapter extends BaseTextAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(config: AgnesTextAdapterConfig) {
    super()
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL
    this.apiKey = config.apiKey
    this.model = config.model || DEFAULT_MODEL
  }

  async generate<T = unknown>(request: TextGenerationRequest): Promise<TextGenerationResponse<T>> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'AGNES_TEXT_API_KEY not configured' })
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ]

    // JSON 策略: prompt_only — 将 outputSchema 注入到 system prompt 中
    // 不使用 response_format: { type: 'json_object' }，因为 Agnes API 不保证支持 OpenAI JSON mode
    if (request.outputSchema) {
      const schemaRaw =
        (request.outputSchema as Record<string, unknown>)._raw as string | undefined
      if (schemaRaw && !messages[0].content.includes(schemaRaw.substring(0, 200))) {
        messages[0].content =
          messages[0].content + '\n\n## Required JSON Structure\n' + schemaRaw
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw createAdapterError({
        code: 'API_ERROR',
        message: `Agnes API error (${response.status}): ${errorText.substring(0, 300)}`,
        retryable: response.status >= 500 || response.status === 429,
        statusCode: response.status,
      })
    }

    const data = await response.json()
    const rawText: string = data.choices?.[0]?.message?.content || ''

    // 解析 JSON: 先尝试直接解析, 失败则从 markdown 代码块提取
    let json: T | undefined
    try {
      json = JSON.parse(rawText) as T
    } catch {
      const m = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (m) {
        try { json = JSON.parse(m[1]) as T } catch { /* ignore */ }
      }
    }

    return {
      rawText,
      json,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      } : undefined,
    }
  }
}
