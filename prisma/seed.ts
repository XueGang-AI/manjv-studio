// ============================================
// 种子数据脚本
// 运行：DATABASE_URL="..." npx tsx prisma/seed.ts
// ============================================
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import {
  DEFAULT_ARK_API_BASE_URL,
  DEFAULT_ARK_IMAGE_MODEL,
  DEFAULT_ARK_TEXT_MODEL,
  DEFAULT_ARK_VIDEO_MODEL,
} from '../src/server/model-adapters/model-config'

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL || 'postgresql://manjv:manjv@127.0.0.1:15432/manjv_studio?schema=public',
  }),
})

async function main() {
  console.log('🌱 Seeding database...')

  // 创建默认用户
  const user = await prisma.user.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'default@manjv-studio.local',
      name: '默认用户',
    },
  })
  console.log('✅ Created default user:', user.email)

  // 创建或更新测试项目。按默认用户 + 项目名查找，避免重复 seed 生成多个同名项目。
  const testProjectData = {
    userId: user.id,
    projectName: '雨夜重生（测试项目）',
    storyType: '现代霸总虐恋',
    background: '现代都市，珠宝设计行业',
    mainCharacters: ['林若雪', '顾辰'],
    coreConflict: '爱情与复仇的对立',
    storySummary: '林若雪被前男友背叛并失去工作，在暴雨夜遇到神秘总裁顾辰。顾辰帮助她重回珠宝行业巅峰，两人逐渐相爱，但林若雪发现顾辰家族可能与母亲的死有关。',
    artStyle: '韩漫',
    targetPlatform: '抖音',
    episodeCount: 10,
    episodeDuration: 90,
    aspectRatio: '9:16',
    status: 'DRAFT',
  }
  const existingProject = await prisma.project.findFirst({
    where: { userId: user.id, projectName: testProjectData.projectName },
    orderBy: { createdAt: 'asc' },
  })
  const project = existingProject
    ? await prisma.project.update({
        where: { id: existingProject.id },
        data: testProjectData,
      })
    : await prisma.project.create({
        data: testProjectData,
      })
  console.log('✅ Created test project:', project.projectName)

  // 创建默认模型配置
  const modelConfigs = [
    {
      name: 'Doubao Seed Character',
      type: 'TEXT',
      modelName: process.env.ARK_TEXT_MODEL || DEFAULT_ARK_TEXT_MODEL,
      baseUrl: process.env.ARK_API_BASE_URL || DEFAULT_ARK_API_BASE_URL,
      apiKey: process.env.ARK_API_KEY || '',
      isDefault: true,
      params: { temperature: 0.7, max_tokens: 4096 },
    },
    {
      name: 'Doubao Seedream',
      type: 'IMAGE',
      modelName: process.env.ARK_IMAGE_MODEL || DEFAULT_ARK_IMAGE_MODEL,
      baseUrl: process.env.ARK_API_BASE_URL || DEFAULT_ARK_API_BASE_URL,
      apiKey: process.env.ARK_API_KEY || '',
      isDefault: true,
      params: { aspect_ratio: '9:16', num_outputs: 4 },
    },
    {
      name: 'Doubao Seedance',
      type: 'VIDEO',
      modelName: process.env.ARK_VIDEO_MODEL || DEFAULT_ARK_VIDEO_MODEL,
      baseUrl: process.env.ARK_API_BASE_URL || DEFAULT_ARK_API_BASE_URL,
      apiKey: process.env.ARK_API_KEY || '',
      isDefault: true,
      params: { duration: 5, fps: 24, motion_strength: 'medium', resolution: process.env.ARK_VIDEO_RESOLUTION || '720p' },
    },
  ]

  for (const config of modelConfigs) {
    await prisma.modelConfig.upsert({
      where: { name: config.name },
      update: {
        type: config.type,
        modelName: config.modelName,
        baseUrl: config.baseUrl,
        isDefault: config.isDefault,
        params: config.params,
        ...(process.env.ARK_API_KEY ? { apiKey: process.env.ARK_API_KEY } : {}),
      },
      create: config,
    })
  }
  console.log('✅ Created model configs')

  console.log('🎉 Seed complete!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
