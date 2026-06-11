# 🎬 AI 漫剧可视化生产工作台 (manjv-studio)

AI 驱动的漫剧创作平台，支持故事分析、角色设计、分镜生成、视频合成。

## 技术栈

- **前端**: Next.js 16 + TypeScript + TailwindCSS
- **数据库**: PostgreSQL + Prisma 7
- **任务队列**: BullMQ + Redis
- **视频合成**: FFmpeg 8
- **AI 模型**: Agnes-2.0-Flash / Agnes-Image-2.0-Flash / Agnes-Video-V2.0
- **测试**: vitest

## 当前状态

| 模式 | 文本模型 | 图片模型 | 视频模型 | 全流程 |
|------|----------|----------|----------|--------|
| Mock | ✅ 可跑通 | ✅ 可跑通 | ✅ 可跑通 | ✅ `npm run test:e2e` |
| 真实 API | ✅ 已接通 | ✅ 已接通 | ✅ 已接通并验证 | ✅ 文本+图片+视频全部可通 |

### 真实视频当前状态

- **task 创建**: ✅ 成功，返回 `task_id`
- **轮询**: ✅ `GET /v1/videos/{task_id}` 可用
- **视频完成**: ✅ 已验证（历史 task 已 completed + 下载 + ffprobe）
- **video_url 字段**: ⚠️ 位于 `remixed_from_video_id`（非 `video_url`）
- **队列延迟**: ⚠️ 非高峰期 ~2min 处理，高峰期可能数小时排队
- **分辨率**: 当前输出 1280×768
- **异步模式**: ✅ Adapter 已重构，支持 create/poll/wait/download
- **任务恢复**: ✅ 支持根据 task_id 继续轮询
- **TTS 配音**: ✅ `generate_audio: true` 始终开启
- **输入限制**: ⚠️ 仅支持 1 张 inputImage，不支持多张 reference_images

### 角色参考图系统

多角度：front_full_body / front_half_body / left_side / right_side / back_view。
快速模式（1张）和一致性模式（5张），锚点图先行，后续角度以锚点图为参考。
- 去重：已有角度自动跳过
- 重试：单张失败指数退避 ×3
- 先成后删：regenerate 全部成功再替换旧图
- 批量确认：一键确认所有角度

### 分镜图系统

- prompt 嵌入角色完整外貌描述（hair/eyes/skin/face/clothing/signatureFeatures）
- 根据镜头 shot_size 自动匹配最合适的角色参考角度
- 批量确认：一键确认所有镜头
- ⚠️ Agnes Image API 传 `reference_images` 时忽略 `num_outputs`，因此不传 refs 以获取 4 张候选图

### 视频生成

- 每个镜头生成 1 段视频（非 2 段）
- `generate_audio: true` 始终开启

### 项目表单字段

| 字段 | 类型 | 说明 |
|------|------|------|
| 故事类型 | 多选 + 自定义 | 可选多个标签，支持自定义输入 |
| 期望画风 | 多选 + 自定义 | 可组合多个风格，如"韩漫, 电影感, 都市雨夜" |
| 单集时长 | 15-300s | 快捷选项 + 自定义输入，单位为秒 |
| 核心冲突 | 选填 | 留空时 AI 自动提炼 |

### 剩余风险

见 [docs/REAL_AGNES_API_PROBE_REPORT.md#剩余风险](docs/REAL_AGNES_API_PROBE_REPORT.md)：

1. 视频队列延迟不确定，高峰期可能等很久
2. 视频分辨率可能不是 1080×1920，需 FFmpeg 后处理
3. 批量生成可能存在并发/QPS 限制
4. 视频内容质量仍需人工确认
5. API 返回字段可能变化，已通过多字段回退兼容
6. Agnes Image API 传 `reference_images` 时忽略 `num_outputs`

## 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- FFmpeg（推荐 8.x）

### 安装

```bash
# 1. 安装依赖
npm install --cache ~/.npm-cache-new

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写实际配置

# 3. 创建数据库
createdb manjv_studio

# 4. 推送数据库 schema
npm run db:push

# 5. 填充种子数据
npm run db:seed
```

### 开发

```bash
npm run dev
```

访问 http://localhost:3000

### 测试

```bash
# 单元测试
npm test                    # 18 tests

# Mock 全流程 E2E
npm run test:e2e            # 20 steps, auto confirm, → MP4

# 真实 API 探针
npm run probe:agnes:text       # /chat/completions
npm run probe:agnes:image      # /images/generations
npm run probe:agnes:video      # /videos (async poll)
npm run probe:agnes:video:poll # 轮询已有 task
npm run probe:agnes:video:t2v  # Case A: 纯文生视频
npm run probe:agnes:video:i2v-url  # Case B: 图生视频(URL)
npm run probe:agnes:video:i2v-b64  # Case C: 图生视频(b64)
npm run probe:agnes:video:audio # 音频/口型探针

# 30s 短视频原型（全流程）
npx tsx scripts/e2e-real-15s-prototype.ts

# 真实 API 最小闭环
npm run test:e2e:real
```

## 项目结构

```
manjv-studio/
├── src/
│   ├── app/                    # Next.js App Router (页面 + API)
│   ├── components/             # React 组件
│   │   ├── layout/             # Sidebar, TopBar
│   │   ├── project/            # ProjectForm, StoryDisplay, etc.
│   │   └── ui/                 # Button, Card, Input, Badge
│   ├── lib/                    # utils, prisma client, validators
│   ├── server/
│   │   ├── model-adapters/     # 统一适配层 (Text/Image/Video + Mock)
│   │   ├── queues/             # BullMQ 任务队列
│   │   ├── services/           # Prompt, FFmpeg, Version, QC
│   │   ├── storage/            # 文件存储
│   │   └── workflows/          # 工作流
│   └── __tests__/              # 单元测试
├── prisma/                     # Schema + Seed
├── prompts/                    # 25 .prompt + 23 .json 素材库
├── scripts/                    # E2E + 探针脚本
├── uploads/                    # 文件上传 + 视频输出
└── docs/                       # 完整文档
```

## 核心流程

```
创建项目 → 故事方案 → 角色设定 → 角色图 → 分镜脚本 → 分镜图 → 视频片段 → 成片 MP4
   ↓           ↓         ↓        ↓         ↓         ↓         ↓          ↓
 Phase 3    Phase 4   Phase 5  Phase 6   Phase 7   Phase 8   Phase 9   Phase 10
     + Phase 11 (任务队列) + Phase 12 (版本管理) + Phase 13 (QC)
```

## 数据库

21 张表: users, projects, story_packages, characters, character_images, episodes, shots, image_prompts, shot_images, video_prompts, shot_videos, voice_scripts, final_videos, generation_tasks, task_logs, prompt_templates, prompt_template_versions, model_configs, project_versions, qc_reports, asset_files

## 环境变量

见 [docs/ENV.md](docs/ENV.md)

## 文档索引

| 文档 | 内容 |
|------|------|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发指南 |
| [docs/E2E_TEST.md](docs/E2E_TEST.md) | E2E 测试指南 |
| [docs/API.md](docs/API.md) | API 文档 (60+ endpoints) |
| [docs/ENV.md](docs/ENV.md) | 环境变量说明 |
| [docs/PHASE_1_13_SUMMARY.md](docs/PHASE_1_13_SUMMARY.md) | 开发阶段总结 |
| [docs/REAL_AGNES_API_PROBE_REPORT.md](docs/REAL_AGNES_API_PROBE_REPORT.md) | 真实 API 探针报告 |
| [docs/REAL_AGNES_API_TODO.md](docs/REAL_AGNES_API_TODO.md) | API 接入待办 |
| [docs/REAL_SAMPLE_ACCEPTANCE_REPORT.md](docs/REAL_SAMPLE_ACCEPTANCE_REPORT.md) | 30s 原型验收报告 |
| [docs/AGNES_VIDEO_AUDIO_LIPSYNC_PROBE_REPORT.md](docs/AGNES_VIDEO_AUDIO_LIPSYNC_PROBE_REPORT.md) | 视频音频/口型探针 |
| [docs/AGNES_VIDEO_AUDIO_LIPSYNC_COMPLETED_REPORT.md](docs/AGNES_VIDEO_AUDIO_LIPSYNC_COMPLETED_REPORT.md) | 视频音频 completed 验证 |

## Agent 规则文件

[CLAUDE.md](CLAUDE.md) — Claude Code 项目上下文（技术栈、架构原则、快速命令、当前状态、开发注意事项）

## npm 缓存注意

本地 npm 缓存有权限问题，请使用 `--cache ~/.npm-cache-new` 标志。
