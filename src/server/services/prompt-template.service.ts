// ============================================
// Prompt 模板服务 - 读取/渲染/校验
// ============================================
import prisma from '@/lib/prisma'

export interface RenderedPrompt {
  systemPrompt: string
  userPrompt: string
  outputSchema: Record<string, unknown> | null
}

export class PromptTemplateService {
  /**
   * 从数据库加载指定模板
   */
  async loadTemplate(name: string) {
    const template = await prisma.promptTemplate.findUnique({
      where: { name },
    })

    if (!template) {
      throw new Error(`Prompt template not found: ${name}`)
    }

    if (!template.enabled) {
      throw new Error(`Prompt template is disabled: ${name}`)
    }

    return template
  }

  /**
   * 渲染模板：分离 System Prompt 和 User Prompt，填充变量
   */
  async render(name: string, variables: Record<string, string>): Promise<RenderedPrompt> {
    const template = await this.loadTemplate(name)
    const content = template.template

    // 解析模板中的 System Prompt 和 User Prompt 段
    const systemMatch = content.match(/## System Prompt\n([\s\S]*?)(?=\n## User Prompt|\n## Output|\n## Variables|$)/)
    const userMatch = content.match(/## User Prompt\n([\s\S]*?)(?=\n## Output|\n## Variables|$)/)
    const schemaMatch = content.match(/## Output JSON Schema\n([\s\S]*?)(?=\n## |\n---|\n\*\/|$)/)

    let systemPrompt = systemMatch ? systemMatch[1].trim() : ''
    let userPrompt = userMatch ? userMatch[1].trim() : ''

    // 填充变量 {{variable_name}}
    systemPrompt = this.fillVariables(systemPrompt, variables)
    userPrompt = this.fillVariables(userPrompt, variables)

    // 提取 output schema 并注入到 system prompt
    let outputSchema: Record<string, unknown> | null = null
    if (schemaMatch) {
      const schemaText = schemaMatch[1].trim()
      outputSchema = {
        _defined: true,
        _raw: schemaText,
      }
      // 注入 schema 到 system prompt，让 AI 知道完整输出结构
      systemPrompt = systemPrompt + '\n\n## Required Output JSON Structure\nYou MUST output a JSON object that exactly matches the following structure. Every field is required — do not leave any field empty or null:\n\n' + schemaText
    }

    // 输出格式约束
    systemPrompt = systemPrompt + '\n\nCRITICAL: Output ONLY the JSON object. No markdown, no explanations, no code blocks. Every field in the schema above MUST be populated with realistic, detailed content. Empty objects {} or empty arrays [] are NOT acceptable.'

    return { systemPrompt, userPrompt, outputSchema }
  }

  /**
   * 获取模板的变量列表
   */
  async getVariables(name: string): Promise<string[]> {
    const template = await this.loadTemplate(name)
    return (template.variables as string[]) || []
  }

  /**
   * 填充模板变量
   * {{variable_name}} → value
   * 未提供的变量替换为空字符串
   */
  private fillVariables(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (varName in variables) {
        return variables[varName]
      }
      // 尝试转换 snake_case JSON 变量
      if (varName.endsWith('_json') && varName.replace('_json', '') in variables) {
        return variables[varName.replace('_json', '')]
      }
      console.warn(`Variable not provided: {{${varName}}}, using empty string`)
      return ''
    })
  }
}

// 单例
export const promptTemplateService = new PromptTemplateService()
