# 开发指南

## 环境搭建

```bash
# 1. 依赖
brew install postgresql@16 redis ffmpeg

# 2. 启动服务
brew services start postgresql@16
brew services start redis

# 3. 创建数据库
createdb manjv_studio

# 4. 安装项目依赖
npm install --cache ~/.npm-cache-new

# 5. 配置环境
cp .env.example .env

# 6. 推送数据库
DATABASE_URL="postgresql://xuegang@localhost:5432/manjv_studio?schema=public" npm run db:push

# 7. 种子数据
DATABASE_URL="postgresql://xuegang@localhost:5432/manjv_studio?schema=public" npm run db:seed

# 8. 启动开发
DATABASE_URL="postgresql://xuegang@localhost:5432/manjv_studio?schema=public" npm run dev
```

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes (60+ endpoints)
│   └── projects/           # Pages (14 routes)
├── components/
│   ├── layout/             # Sidebar, TopBar
│   ├── project/            # ProjectForm, StoryDisplay, CharacterCard, etc.
│   └── ui/                 # Button, Card, Input, Badge
├── lib/                    # Utils, Prisma client, Validators
├── server/
│   ├── model-adapters/     # types → base → mock/agnes → factory
│   │   ├── mock/           # MockText/Image/VideoAdapter
│   │   └── agnes/          # AgnesText/Image/VideoAdapter (real API)
│   ├── queues/             # task-queue.service, generation.worker
│   ├── services/           # prompt-template, ffmpeg, version, qc
│   ├── storage/            # File storage
│   └── workflows/          # Pipeline types
└── __tests__/              # 18 unit tests (vitest)

prisma/                     # Schema (21 models) + Seed
prompts/                    # 25 .prompt + 23 .json (Phase 2 asset library)
scripts/
  e2e-mock-flow.ts          # Mock 全流程 E2E (20 steps)
  e2e-real-minimal.ts       # Real API 最小闭环
  probes/                   # API 探针脚本
uploads/                    # File uploads + final_videos output
docs/                       # Complete documentation
```

## 代码规范

- 模型调用必须通过 `adapterFactory`，禁止直接调用 Agnes API
- Prompt 必须从 `prompt_templates` 表读取，禁止硬编码
- 生成任务必须写入 `generation_tasks` 表
- API 返回统一格式 `{success, data/error}`
- 组件和页面分离，组件可复用

## Model Adapter 架构

```
AdapterFactory (单例)
├── USE_MOCK_MODEL=true  → MockTextAdapter / MockImageAdapter / MockVideoAdapter
└── USE_MOCK_MODEL=false → AgnesTextAdapter / AgnesImageAdapter / AgnesVideoAdapter

AgnesTextAdapter  → POST /v1/chat/completions
AgnesImageAdapter → POST /v1/images/generations
AgnesVideoAdapter → POST /v1/videos (create) → GET /v1/videos/{task_id} (poll)
```

## Phase 1-13 总览

| Phase | 内容 | 关键产物 |
|-------|------|----------|
| 1 | 项目初始化 | Next.js + Prisma + 布局 |
| 2 | Prompt 模板库 | 25 .prompt + 23 .json |
| 3 | 项目 CRUD | 表单+校验+列表+详情 |
| 4 | 故事方案 | AI 分析 + JSON Schema |
| 5 | 角色设定卡 | 外表/性格/Prompt 三维 |
| 6 | 角色图 | 每角色 4 候选+标准图 |
| 7 | 分镜脚本 | 6-8 shots + img/vid prompt |
| 8 | 分镜图 | reference + 一致性 |
| 9 | 视频片段 | 图生视频 2 candidates |
| 10 | 成片合成 | FFmpeg → 1080×1920 MP4 |
| 11 | 任务队列 | BullMQ + SSE + 重试/取消 |
| 12 | 版本管理 | createVersion + rollback |
| 13 | 质量检查 | 6 维 QC + 评分 + 建议 |

## 测试

```bash
npm test             # Unit tests (18/18)
npm run test:e2e     # Mock E2E (20/20)
npm run test:e2e:real # Real API minimal (text+image ✅, video ⚠️)
```
