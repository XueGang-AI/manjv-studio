# 🎬 Manjv Studio — AI 漫剧可视化生产工作台

> AI 驱动的短剧漫剧全流程生产平台：从故事分析到成片输出，覆盖角色设计、分镜生成、图像/视频生成、FFmpeg 合片全链路。

## ✨ 核心特性

- **全流程自动化** — 8 步工作流：创建项目 → 故事方案 → 角色设定 → 角色图 → 分镜脚本 → 分镜图 → 视频片段 → 成片 MP4
- **双 AI Provider** — 免费 Agnes + 付费 Ark/豆包，项目级切换
- **角色一致性系统** — 多角度参考图（5 视角）+ 锚点先行策略，确保跨镜头角色外貌统一
- **模板驱动 Prompt** — 25 个 `.prompt` 模板 + 23 个 `.json` 素材库，禁止硬编码
- **版本管理** — 关键确认节点自动快照，支持回滚与对比
- **QC 质检** — 6 维度评分（故事 / 角色 / 分镜 / 图像 / 视频 / 成片）

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router + Turbopack) | 16 |
| 语言 | TypeScript | 5+ |
| UI | React + TailwindCSS v4 | 19 |
| 数据库 | PostgreSQL + Prisma | 16+ / 7 |
| 状态管理 | Zustand | 5 |
| 数据请求 | @tanstack/react-query | 5 |
| 视频合成 | FFmpeg | 8.x |
| 测试 | Vitest | 4 |

**AI 模型**

| 用途 | Agnes（免费） | Ark/豆包（付费） |
|------|---------------|------------------|
| 文本 | Agnes-2.0-Flash | doubao-seed-character-251128 |
| 图片 | Agnes-Image-2.0-Flash | doubao-seedream-5-0-260128 |
| 视频 | Agnes-Video-V2.0 | doubao-seedance-1-5-pro-251215 |

## 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL 16+
- FFmpeg 8.x（视频合成）

> ⚠️ 本地 npm 缓存有权限问题，安装时请使用 `--cache ~/.npm-cache-new`。

### 安装

```bash
# 1. 安装依赖
npm install --cache ~/.npm-cache-new

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，至少填写 DATABASE_URL

# 3. 创建数据库
createdb manjv_studio

# 4. 推送 Schema + 种子数据
npm run db:push
npm run db:seed
```

### 开发

```bash
npm run dev    # 启动开发服务器 → http://localhost:3000
```

### 测试

```bash
npm test                       # 单元测试（18 cases）
npm run test:e2e               # Mock 全流程 E2E（20 steps → MP4）
npm run test:e2e:real          # 真实 API 最小闭环
npx tsx scripts/e2e-real-15s-prototype.ts  # 30s 原型全流程
```

### API 探针

```bash
# Agnes
npm run probe:agnes:text           # 文本生成
npm run probe:agnes:image          # 图片生成
npm run probe:agnes:video          # 视频生成（创建 + 短轮询）
npm run probe:agnes:video:poll     # 轮询已有任务（需 --task-id <id>）
npm run probe:agnes:video:t2v      # 文生视频
npm run probe:agnes:video:i2v-url  # 图生视频（URL）
npm run probe:agnes:video:i2v-b64  # 图生视频（Base64）
npm run probe:agnes:video:audio    # 音频/口型

# Ark/豆包
npm run probe:ark:text             # 文本生成
npm run probe:ark:image            # 图片生成
npm run probe:ark:video            # 视频生成
npm run probe:ark:video:poll       # 视频任务轮询（需 --task-id <id>）
```

## 项目结构

```
manjv-studio/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (pages)/                # 页面路由（项目、设置、Prompt 浏览等）
│   │   └── api/                    # API 路由（60+ endpoints）
│   ├── components/                 # React 组件
│   │   ├── layout/                 # Sidebar, TopBar
│   │   ├── project/                # 项目相关（Form, Card, StepNavigator…）
│   │   └── ui/                     # 基础 UI（Button, Card, Input, Badge）
│   ├── lib/                        # 工具库（utils, prisma, validators, types）
│   ├── server/
│   │   ├── model-adapters/         # 🎯 AI 模型统一适配层
│   │   │   ├── types.ts            # ITextAdapter / IImageAdapter / IVideoAdapter
│   │   │   ├── adapter.factory.ts  # AdapterFactory 单例
│   │   │   ├── mock/               # Mock 适配器
│   │   │   ├── agnes/              # Agnes 适配器
│   │   │   └── ark/                # Ark 适配器
│   │   ├── services/               # 业务服务（Prompt, FFmpeg, Version, QC）
│   │   ├── storage/                # 文件存储（Phase 1: 本地）
│   │   ├── queues/                 # 任务队列（Prisma TaskService）
│   │   └── workflows/              # 工作流类型定义（Phase 2 预留）
│   └── __tests__/                  # 单元测试
├── prisma/                         # Prisma Schema + Seed
├── prompts/                        # Prompt 模板库（25 .prompt + 23 .json）
│   ├── story/                      # 故事分析、创作、改编、优化
│   ├── character/                  # 角色设计、关系网络
│   ├── storyboard/                 # 分镜、开头钩子、结尾钩子
│   ├── image/                      # 图片 Prompt、角色视觉、场景、表情、风格、光照、镜头
│   ├── video/                      # 视频 Prompt、三幕运动、Seedance 分镜网格
│   ├── camera/                     # 镜头知识库、运动分类、经典/特效运镜
│   ├── audio/                      # 配音脚本
│   ├── platform/                   # 标题文案、平台优化
│   ├── qc/                         # 文本/图片/视频质检
│   └── style/                      # 电影风格库
├── scripts/                        # E2E + 探针脚本
├── uploads/                        # 文件上传 + 视频输出（gitignored）
└── docs/                           # 项目文档
```

## 核心流程

```
创建项目 → 故事方案 → 角色设定 → 角色图 → 分镜脚本 → 分镜图 → 视频片段 → 成片 MP4
   ↓          ↓         ↓        ↓         ↓         ↓         ↓         ↓
 Phase 3   Phase 4   Phase 5  Phase 6   Phase 7   Phase 8   Phase 9  Phase 10
```

每个阶段必须确认后才能推进到下一步，`StepNavigator` 组件强制执行锁定/解锁/完成状态。

### 数据库

21 张表，核心实体：`Project` → `StoryPackage` → `Character` → `CharacterImage` → `Episode` → `Shot` → `ShotImage` → `ShotVideo` → `FinalVideo`

辅助表：`GenerationTask`（任务追踪）、`TaskLog`（执行日志）、`PromptTemplate`/`PromptTemplateVersion`（模板管理）、`ProjectVersion`（版本快照）、`QCReport`（质检报告）、`AssetFile`（文件资产）

## AI Provider 配置

### Agnes（免费）

`.env` 默认配置即可：

```env
AGNES_API_KEY=your_key
AGNES_API_BASE_URL=https://api.agnes.ai/v1
USE_MOCK_MODEL=false
```

### Ark/豆包（付费）

```env
ARK_API_KEY=your_key
ARK_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
MODEL_PROVIDER=ark
USE_MOCK_MODEL=false
```

创建项目时选择 Provider，或通过 `modelProvider` 字段在已有项目中切换。

## 已知限制

| 问题 | 说明 |
|------|------|
| Agnes 视频队列延迟 | 非高峰 ~2min，高峰期可能数小时 |
| Agnes 视频分辨率 | 输出 1280×768，需 FFmpeg 后处理 |
| Agnes Image + reference_images | 传 `reference_images` 时忽略 `num_outputs`，只返回 1 张 |
| Agnes Video 输入限制 | 仅支持 1 张 `inputImage`，不支持多张 reference_images |
| 视频内容质量 | 需人工确认，AI 生成不可控 |
| 批量并发 | 可能存在 QPS 限制 |

## 文档索引

| 文档 | 内容 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | Claude Code 项目上下文 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发指南 |
| [docs/E2E_TEST.md](docs/E2E_TEST.md) | E2E 测试指南 |
| [docs/API.md](docs/API.md) | API 文档（60+ endpoints） |
| [docs/ENV.md](docs/ENV.md) | 环境变量说明 |
| [docs/PHASE_1_13_SUMMARY.md](docs/PHASE_1_13_SUMMARY.md) | Phase 1-13 开发总结 |
| [docs/REAL_AGNES_API_PROBE_REPORT.md](docs/REAL_AGNES_API_PROBE_REPORT.md) | Agnes API 探针报告 |
| [docs/REAL_AGNES_API_TODO.md](docs/REAL_AGNES_API_TODO.md) | API 接入待办 |
| [docs/REAL_SAMPLE_ACCEPTANCE_REPORT.md](docs/REAL_SAMPLE_ACCEPTANCE_REPORT.md) | 30s 原型验收报告 |
| [docs/AGNES_VIDEO_AUDIO_LIPSYNC_PROBE_REPORT.md](docs/AGNES_VIDEO_AUDIO_LIPSYNC_PROBE_REPORT.md) | 视频/音频/口型探针 |
| [docs/AGNES_VIDEO_AUDIO_LIPSYNC_COMPLETED_REPORT.md](docs/AGNES_VIDEO_AUDIO_LIPSYNC_COMPLETED_REPORT.md) | 音频 completed 验证 |

## License

Private — 内部项目
