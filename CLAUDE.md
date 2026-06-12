# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## 项目概述

AI 漫剧全流程生产平台。8 步工作流已全部实现：

```
创建项目 → 故事方案 → 角色设定 → 角色图 → 分镜脚本 → 分镜图 → 视频片段 → FFmpeg 成片 MP4
```

面向中国短视频平台（抖音/快手），支持 Agnes（免费）和 Ark/豆包（付费）两种 AI Provider。

## 技术栈

- **Next.js 16** + TypeScript + TailwindCSS v4 (Turbopack)
- **Prisma 7** + PostgreSQL 16 — `datasource.url` 在 `prisma.config.ts`，不在 schema 里
- **Zustand** (状态管理) + **@tanstack/react-query** (数据请求)
- **FFmpeg 8** (视频合成)
- **Vitest** (单元测试)
- AI: Agnes 系列 / Ark 豆包系列

## 关键架构原则

### 1. 模型适配层（核心抽象）

所有 AI 调用必须通过 `adapterFactory`：

```ts
adapterFactory.getTextAdapter(provider)   // ITextAdapter
adapterFactory.getImageAdapter(provider)  // IImageAdapter
adapterFactory.getVideoAdapter(provider)  // IVideoAdapter
```

优先级：`USE_MOCK_MODEL=true` → Mock → `provider="ark"` → Ark → 默认 → Agnes。**禁止绕过 AdapterFactory 直接调用 AI API。**

适配器文件位于 `src/server/model-adapters/`：
- `types.ts` — 接口定义 (ITextAdapter / IImageAdapter / IVideoAdapter)
- `adapter.factory.ts` — AdapterFactory 单例
- `mock/` — Mock 适配器（1s 延迟 + 硬编码数据）
- `agnes/` — Agnes 适配器（OpenAI 兼容协议）
- `ark/` + 根目录 `ark-*.adapter.ts` — Ark 适配器

### 2. 双 Provider 架构

- **Agnes（免费）**：agnes-2.0-flash 系列，项目默认 Provider
- **Ark（付费）**：火山引擎豆包系列，需 `ARK_API_KEY`
- 项目级 `model_provider` 字段控制，创建项目时选择
- `modelName` 在所有 generate/regenerate 路由中按 `project.modelProvider` 动态选择

### 3. Prompt 模板化

所有 Prompt 从 `prompt_templates` 数据库表读取，通过 `PromptTemplateService.render()` 填充 `{{variables}}`。**禁止硬编码 Prompt。** 模板通过 `npm run db:seed` 从 `prompts/` 目录同步。

### 4. 任务记录

所有生成操作写入 `generation_tasks` + `task_logs` 表。TaskService 管理完整生命周期：pending → running → success/failed/cancelled。

### 5. 版本管理

关键确认节点调用 `versionService.createVersion()` 自动保存项目快照，支持回滚与 diff 对比。

### 6. API 统一格式

所有 API 返回：`{success: true, data: T}` 或 `{success: false, error: string}`

### 7. Duration 一致性

`snapShotDuration()`（`src/lib/utils.ts`）确保 DB 存储时长与实际视频匹配：
- Agnes: 8n+1 frames / 24fps
- Ark i2v: 4~12s 整数
- Ark t2v: 5 或 10s

分镜生成时 `getMaxShotDuration()` + `splitOversizedShots()` 从源头约束镜头时长。

### 8. 角色一致性系统

- 多角度参考图：front_full_body / front_half_body / left_side / right_side / back_view
- 锚点图先行，后续角度以锚点图为参考确保一致性
- 去重（已有角度跳过）、失败重试（指数退避 ×3）、先成后删（regenerate 全部成功再替换旧图）
- 分镜图 prompt 嵌入角色完整外貌描述（hair/eyes/skin/face/clothing/signatureFeatures），根据 shot_size 自动匹配参考角度

## 项目状态

| 模块 | 状态 |
|------|------|
| Mock 全流程 | ✅ `npm run test:e2e` 20/20 |
| Agnes 文本 API | ✅ 故事/角色/分镜均通过 |
| Agnes 图片 API | ✅ 角色图 + 分镜图均生成 |
| Agnes 视频 API | ✅ 创建→轮询→下载→ffprobe 全流程 |
| Ark 文本 API | ✅ 适配器已实现 |
| Ark 图片 API | ✅ 适配器已实现 |
| Ark 视频 API | ✅ 适配器已实现 |
| 版本管理 | ✅ 快照/回滚/对比 |
| QC 质检 | ✅ 6 维度评分 |

### 已知问题

- ⚠️ Agnes 视频队列延迟：非高峰 ~2min，高峰可能数小时
- ⚠️ Agnes 视频分辨率：1280×768（非 1080×1920）
- ⚠️ Agnes Image + `reference_images`：忽略 `num_outputs`，只返回 1 张
- ⚠️ Agnes Video 输入限制：仅 1 张 inputImage
- ⚠️ `npm run build` 可能因 Google Fonts 网络不可达而失败

## 快速命令

```bash
npm run dev                          # 开发服务器（需要 DATABASE_URL）
npm test                             # 单元测试（18 cases）
npm run test:e2e                     # Mock 全流程 E2E
npm run test:e2e:real                # 真实 API 最小闭环
npm run db:push                      # 推送 Prisma schema
npm run db:seed                      # 种子数据 + Prompt 模板同步
npm run db:studio                    # Prisma Studio

# API 探针
npm run probe:agnes:text             # Agnes 文本
npm run probe:agnes:image            # Agnes 图片
npm run probe:agnes:video            # Agnes 视频（创建+轮询）
npm run probe:agnes:video:poll       # Agnes 视频轮询（需 --task-id <id>）
npm run probe:ark:text               # Ark 文本
npm run probe:ark:image              # Ark 图片
npm run probe:ark:video              # Ark 视频
npm run probe:ark:video:poll         # Ark 视频轮询（需 --task-id <id>）

# 全流程原型
npx tsx scripts/e2e-real-15s-prototype.ts
```

**npm 缓存**：本地有权限问题，使用 `npm install --cache ~/.npm-cache-new`。

## 开发注意事项

### Next.js 16

- `params` 在路由处理器中为 `Promise` 类型：`const { id } = await params`
- Server Components 为默认模式
- `npm run build` 可能因 Google Fonts 网络不可达而失败

### Prisma 7

- Schema 变更后：`npx prisma generate` + `npm run db:push`
- PrismaClient 需要 `adapter` 参数：`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`
- Datasource URL 配置在 `prisma.config.ts`，不在 `schema.prisma`

### Agnes Video API

- 创建：`POST /v1/videos`，参数 `model` + `prompt` + `num_frames` + `frame_rate`
- 推荐轮询：`/agnesapi?video_id=<VIDEO_ID>`（优先用 `video_id`）
- 兼容轮询：`/v1/videos/<task_id>`
- 时长控制：`num_frames`(≤441, 8n+1) + `frame_rate`(1-60)，`seconds = num_frames / frame_rate`
- 视频 URL 字段：`remixed_from_video_id`（旧版兼容）
- TTS 配音：`voice_text` + `generate_audio: true`（始终开启）→ AAC 2ch 48kHz
- 输入限制：仅 1 张 `image`（URL 或 data URI）

### Agnes Image API

- `reference_images` 参数：传此参数时 API 忽略 `num_outputs`，只返回 1 张
- 分镜图一致性策略：prompt 嵌入角色完整外貌描述 + `numOutputs: 4`（不传 reference_images）
- 角色图一致性策略：锚点图先行 + reference_images 传 1 张

### Ark (火山引擎/豆包)

- 文本模型 `doubao-seed-character-251128`：OpenAI 兼容 `/chat/completions`，JSON 策略 `prompt_only`
- 图片模型 `doubao-seedream-5-0-260128`：Ark 图片 API
- 视频模型 `doubao-seedance-1-5-pro-251215`：异步任务（创建 → 轮询 → 下载）
  - t2v 支持 5/10s，i2v 支持 4~12s 整数（`snapArkSeedanceDuration` 自动 clamp）
- 环境变量：`ARK_API_KEY` + `ARK_API_BASE_URL`（默认 `https://ark.cn-beijing.volces.com/api/v3`）

### 项目表单

- `story_type` / `art_style`：多选 + 自定义，逗号分隔存储
- `episode_duration`：15-300s，整数
- `core_conflict`：选填，空值时 AI 自动提炼

### 禁止提交

- `.env` / `uploads/` / `scripts/output/`（已 .gitignore）
- 任何包含 API Key（`sk-` 等）的文件
- 视频/图片产物
