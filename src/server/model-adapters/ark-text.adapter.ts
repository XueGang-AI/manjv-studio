// ============================================
// ArkTextAdapter — 豆包 Seed 文本适配器
// 模型: doubao-seed-2.0-pro
// Endpoint: POST {baseUrl}/chat/completions (OpenAI 兼容)
// JSON 策略: prompt_only (schema 嵌入 prompt, 不使用 response_format)
// ============================================
import { BaseTextAdapter, createAdapterError } from './base.adapter'
import { TextGenerationRequest, TextGenerationResponse } from './types'

export interface ArkTextAdapterOptions {
  model: string
  apiKey: string
  baseUrl: string
}

const DEFAULT_MODEL = 'doubao-seed-2.0-pro'
const DEFAULT_TIMEOUT_MS = 120000

export class ArkTextAdapter extends BaseTextAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(options: ArkTextAdapterOptions) {
    super()
    this.model = options.model || DEFAULT_MODEL
    this.apiKey = options.apiKey
    this.baseUrl = options.baseUrl
  }

  async generate<T = unknown>(request: TextGenerationRequest): Promise<TextGenerationResponse<T>> {
    if (!this.apiKey) {
      throw createAdapterError({ code: 'AUTH_ERROR', message: 'ArkTextAdapter: apiKey is required' })
    }
    if (!this.baseUrl) {
      throw createAdapterError({ code: 'CONFIG_ERROR', message: 'ArkTextAdapter: baseUrl is required' })
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ]

    // JSON 策略: prompt_only — 将 outputSchema 注入到 system prompt 中
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw createAdapterError({
        code: 'API_ERROR',
        message: `Ark API error (${response.status}): ${errorText.substring(0, 300)}`,
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
        try {
          json = JSON.parse(m[1]) as T
        } catch {
          /* 解析失败, json 保持 undefined */
        }
      }
    }

    return {
      rawText,
      json,
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
          }
        : undefined,
    }
  }
}
