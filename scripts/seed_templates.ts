// ============================================
// Prompt 模板数据库入库脚本
// 读取 /prompts 目录下所有 .prompt 文件并入库
// 运行：DATABASE_URL="..." npx tsx scripts/seed_templates.ts
// ============================================
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import fs from 'fs'

import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROMPTS_DIR = path.resolve(__dirname, '../prompts')

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL || 'postgresql://xuegang@127.0.0.1:15432/manjv_studio?schema=public',
  }),
})

interface PromptFileInfo {
  name: string
  category: string
  filePath: string
  content: string
  variables: string[]
  sourceFile: string
}

/**
 * 递归查找所有 .prompt 文件
 */
function findPromptFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findPromptFiles(fullPath))
    } else if (entry.name.endsWith('.prompt')) {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * 解析 .prompt 文件，提取元数据
 */
function parsePromptFile(filePath: string): PromptFileInfo {
  const content = fs.readFileSync(filePath, 'utf-8')
  const fileName = path.basename(filePath, '.prompt')
  const category = path.basename(path.dirname(filePath))

  // 提取变量
  const varMatch = content.match(/## Variables\n([\s\S]*?)(?=\n##|\n---|\n*$)/)
  const variables: string[] = []
  if (varMatch) {
    const varText = varMatch[1]
    // 匹配 {{variable_name}}
    const varRegex = /\{\{(\w+)\}\}/g
    let match
    while ((match = varRegex.exec(varText)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1])
      }
    }
    // 如果 Variables 块中没有 {{}}，直接提取单词
    if (variables.length === 0) {
      const words = varText.match(/\w+/g)
      if (words) {
        variables.push(...words.filter(w => w.length > 2 && w !== 'Variables'))
      }
    }
  }

  // 如果 Variables 解析失败，从全文提取
  if (variables.length === 0) {
    const allVars = content.match(/\{\{(\w+)\}\}/g)
    if (allVars) {
      for (const v of allVars) {
        const name = v.replace(/[{}]/g, '')
        if (!variables.includes(name)) {
          variables.push(name)
        }
      }
    }
  }

  // 提取来源文件
  const sourceMatch = content.match(/来源文件:\s*(.+)/)
  const sourceFile = sourceMatch ? sourceMatch[1].trim() : 'unknown'

  return {
    name: fileName,
    category,
    filePath,
    content,
    variables,
    sourceFile,
  }
}

async function main() {
  console.log('🌱 Seeding prompt templates to database...\n')

  const promptFiles = findPromptFiles(PROMPTS_DIR)
  console.log(`Found ${promptFiles.length} .prompt files\n`)

  let created = 0
  let updated = 0
  let errors = 0

  for (const filePath of promptFiles) {
    const info = parsePromptFile(filePath)

    try {
      const existing = await prisma.promptTemplate.findUnique({
        where: { name: info.name },
      })

      if (existing) {
        // Update existing
        await prisma.promptTemplate.update({
          where: { name: info.name },
          data: {
            template: info.content,
            category: info.category,
            variables: info.variables,
            outputSchema: outputSchemaFromInfo(info),
            version: { increment: 1 },
            sourceFile: info.sourceFile,
            updatedAt: new Date(),
          },
        })
        updated++
        console.log(`  📝 Updated: ${info.category}/${info.name}`)
      } else {
        // Create new
        await prisma.promptTemplate.create({
          data: {
            name: info.name,
            category: info.category,
            description: extractDescription(info.content, info.name),
            template: info.content,
            outputSchema: outputSchemaFromInfo(info),
            variables: info.variables,
            version: 1,
            enabled: true,
            sourceFile: info.sourceFile,
          },
        })
        created++
        console.log(`  ✅ Created: ${info.category}/${info.name} (${info.variables.length} vars)`)
      }
    } catch (err) {
      errors++
      console.error(`  ❌ Error: ${info.category}/${info.name}: ${(err as Error).message}`)
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`📊 Seed Results:`)
  console.log(`   Created: ${created}`)
  console.log(`   Updated: ${updated}`)
  console.log(`   Errors:  ${errors}`)
  console.log(`   Total:   ${created + updated}`)
  console.log(`${'='.repeat(60)}`)
}

function extractDescription(content: string, name: string): string {
  const lines = content.split('\n')
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i].trim()
    if (line.startsWith('## System Prompt') && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim()
      if (nextLine && !nextLine.startsWith('#') && !nextLine.startsWith('你')) {
        // Next line after System Prompt header might be just a role description
        const roleMatch = content.match(/## System Prompt\n(.+?)(?=\n##|\n\s*\n)/)
        if (roleMatch) {
          return roleMatch[1].trim().substring(0, 200)
        }
      }
    }
  }
  return `Prompt template: ${name}`
}

function outputSchemaFromInfo(info: PromptFileInfo): Record<string, unknown> | null {
  const schemaMatch = info.content.match(/## Output JSON Schema\n([\s\S]*?)(?=\n## |\n---|\n\*\/|\n*$)/)
  if (schemaMatch) {
    return {
      _defined: true,
      _description: schemaMatch[1].trim().substring(0, 1000),
      _variables: info.variables,
    }
  }
  return { _defined: false, _variables: info.variables }
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
