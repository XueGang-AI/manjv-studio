# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

AI 驱动的漫剧创作平台。核心流程（全部已实现）:

```
创建项目 → 故事方案 → 角色设定 → 角色图 → 分镜脚本 → 分镜图 → 视频片段 → FFmpeg 成片 MP4
```

## 技术栈

- Next.js 16 + TypeScript + TailwindCSS（Turbopack 默认）
- Prisma 7 + PostgreSQL 16（`datasource.url` 在 `prisma.config.ts`，非 schema）
- BullMQ + Redis 7（任务队列）
- FFmpeg 8.1（视频合成）
- vitest（单元测试）
- Agnes AI: Agnes-2.0-Flash / Agnes-Image-2.0-Flash / Agnes-Video-V2.0

## 关键架构原则

1. **模型适配层**: 所有 AI 调用必须通过 `adapterFactory.getTextAdapter()` 等统一接口。`USE_MOCK_MODEL` 控制 Mock/Real 切换。禁止绕过 AdapterFactory 直接调用 API。
2. **Prompt 模板化**: 所有 Prompt 从 `prompt_templates` 表读取，通过 `PromptTemplateService.render()` 填充 `{{variables}}`。禁止硬编码 Prompt。
3. **任务记录**: 所有生成操作写入 `generation_tasks` + `task_logs`。
4. **版本管理**: 关键确认节点调用 `versionService.createVersion()` 自动保存快照。
5. **API 统一格式**: `{success: true, data: {}}` 或 `{success: false, error: ""}`。

## 快速命令

```bash
npm run dev                          # 启动 (需要 DATABASE_URL)
npm test                             # unit tests (18 cases)
npm run test:e2e                     # Mock 全流程 (20 steps → MP4)
npm run test:e2e:real                # 真实 API 最小闭环
npm run db:push                      # 推送 Prisma schema
npm run db:seed                      # 种子数据
npm run probe:agnes:text             # 文本探针
npm run probe:agnes:image            # 图片探针
npm run probe:agnes:video            # 视频探针（创建+短轮询）
npm run probe:agnes:video:poll       # 轮询已有 task（需 --task-id <id>）
npm run probe:agnes:video:t2v        # Case A: 文生视频
npm run probe:agnes:video:i2v-url    # Case B: 图生视频(URL)
npm run probe:agnes:video:i2v-b64    # Case C: 图生视频(b64)
npm run probe:agnes:video:audio      # 音频/口型探针（仅创建 task）
npx tsx scripts/e2e-real-15s-prototype.ts  # 30s 原型全流程
```

**npm 缓存**: 本地有权限问题，使用 `--cache ~/.npm-cache-new`。

## 当前状态

- Mock 模式: ✅ `npm run test:e2e` 20/20
- 真实文本 API: ✅ 故事/角色/分镜均通过
- 真实图片 API: ✅ 角色图+分镜图均生成
- 真实视频 API: ✅ 创建→轮询→completed→下载→ffprobe 全部验证
  - ⚠️ 队列延迟 ~2min（非高峰）到数小时（高峰）
  - ⚠️ video_url 在 `remixed_from_video_id` 字段
  - ✅ Adapter 异步模式: `createVideoTask()` → `pollVideoTask()` → `downloadVideo()`
  - ✅ TTS 配音: shot 有 dialogue 时自动传 `voice_text` + `generate_audio`
- 角色参考图: 多角度系统（front_full_body/front_half_body/left_side/right_side/back_view）
- 分镜图 reference: 根据 shot 内容自动选择角色参考图

## 开发注意事项

### Next.js 16

- `params` 在路由处理器中为 `Promise` 类型：`const { id } = await params`
- Server Components 为默认模式
- `npm run build` 可能因 Google Fonts 网络不可达而失败（预存在环境问题）

### Prisma 7

- Schema 变更后需执行 `npx prisma generate` + `npm run db:push`
- PrismaClient 构造函数需 `adapter` 参数：`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`

### Agnes Video API

- 视频 URL 字段：`remixed_from_video_id`（非 `video_url`、`url`）
- 异步模式：`createVideoTask()` → 保存 `remote_task_id` → `pollVideoTask()` 或 `waitForVideoCompletion()` → `downloadVideo()`
- TTS 配音：`voice_text` + `generate_audio` → 产出 AAC 2ch 48kHz 音轨
- 探针验证的额外可接受字段：`dialogue`、`audio_url`、`voice_id`、`lip_sync`

### 项目表单

- story_type/art_style: 多选+自定义，逗号分隔存储
- episode_duration: 15-300s，整数
- core_conflict: 选填，空值时 AI 自动提炼

### 不要提交

- `.env` / `uploads/` / `scripts/output/`（均被 .gitignore）
- API Key（任何包含 `sk-` 的文件）
- 视频/图片产物
