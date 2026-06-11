// ============================================
// Agnes-2.0-Flash 文本适配器（真实 API）
// ============================================
import { BaseTextAdapter } from '../base.adapter'
import { TextGenerationRequest, TextGenerationResponse } from '../types'

export class AgnesTextAdapter extends BaseTextAdapter {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor() {
    super()
    this.baseUrl = process.env.AGNES_TEXT_API_BASE_URL || 'https://apihub.agnes-ai.com/v1'
    this.apiKey = process.env.AGNES_TEXT_API_KEY || ''
    this.model = process.env.AGNES_TEXT_MODEL || 'agnes-2.0-flash'
  }

  async generate<T = unknown>(request: TextGenerationRequest): Promise<TextGenerationResponse<T>> {
    if (!this.apiKey) {
      throw new Error('AGNES_TEXT_API_KEY not configured')
    }

    const messages = [
      { role: 'system' as const, content: request.systemPrompt },
      { role: 'user' as const, content: request.userPrompt },
    ]

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    }

    if (request.outputSchema) {
      body.response_format = { type: 'json_object' }
      // 如果 schema 内容尚未在 system prompt 中，追加注入
      const schemaRaw = (request.outputSchema as Record<string, unknown>)._raw as string | undefined
      if (schemaRaw && !messages[0].content.includes(schemaRaw.substring(0, 200))) {
        messages[0].content = messages[0].content + '\n\n## Required JSON Structure\n' + schemaRaw
      }
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Agnes API error (${response.status}): ${errorText.substring(0, 300)}`)
    }

    const data = await response.json()
    const rawText = data.choices?.[0]?.message?.content || ''

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
