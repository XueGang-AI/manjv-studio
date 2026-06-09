// ============================================
// JSON Schema 校验器 - Phase 1 基础实现
// ============================================

export class JsonSchemaValidator {
  /**
   * 校验 JSON 输出是否符合预期结构
   * Phase 1: 基本类型检查
   * Phase 2+: 可用 ajv 等库做完整 JSON Schema 校验
   */
  validate(data: unknown, schema: Record<string, unknown>): {
    valid: boolean
    errors: string[]
  } {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      errors.push('Output must be a valid JSON object')
      return { valid: false, errors }
    }

    // Phase 1: 基础校验
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required as string[]) {
        if (!(field in (data as Record<string, unknown>))) {
          errors.push(`Missing required field: ${field}`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 尝试解析 JSON 字符串
   */
  tryParseJSON(text: string): { success: boolean; data?: unknown; error?: string } {
    try {
      // 尝试从文本中提取 JSON（处理模型可能输出 markdown 包裹的情况）
      let jsonStr = text.trim()

      // 移除 markdown 代码块标记
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim()
      }

      const data = JSON.parse(jsonStr)
      return { success: true, data }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }
}

export const jsonValidator = new JsonSchemaValidator()
