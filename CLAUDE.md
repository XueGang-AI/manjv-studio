# manjv-studio — AI 漫剧可视化生产工作台

## 项目概述

AI 驱动的漫剧创作平台。核心流程（全部已实现）:

```
创建项目 → 故事方案 → 角色设定 → 角色图 → 分镜脚本 → 分镜图 → 视频片段 → FFmpeg 成片 MP4
```

## 技术栈

- Next.js 16 + TypeScript + TailwindCSS
- Prisma 7 + PostgreSQL 16 (21 张表)
- BullMQ + Redis 7 (任务队列)
- FFmpeg 8.1 (视频合成)
- vitest (单元测试 18 cases)
- Agnes AI: 文本/图片/视频 三模型

## 关键架构原则

1. **模型适配层**: 所有 AI 调用必须通过 `adapterFactory.getTextAdapter()` 等统一接口。`USE_MOCK_MODEL` 控制 Mock/Real 切换。
2. **Prompt 模板化**: 所有 Prompt 从 `prompt_templates` 表读取，通过 `PromptTemplateService.render()` 填充变量。
3. **任务记录**: 所有生成操作写入 `generation_tasks` + `task_logs`。
4. **版本管理**: 关键确认节点调用 `versionService.createVersion()` 自动保存快照。
5. **API 统一格式**: `{success: true, data: {}}` 或 `{success: false, error: ""}`。

## 快速命令

```bash
npm run dev                     # 启动 (需要 DATABASE_URL)
npm test                        # 18 unit tests
npm run test:e2e                # Mock 全流程 (20 steps → MP4)
npm run test:e2e:real           # 真实 API 最小闭环
npm run db:push                 # 推送 Prisma schema
npm run db:seed                 # 种子数据
npm run probe:agnes:text        # 文本探针
npm run probe:agnes:image       # 图片探针
npm run probe:agnes:video       # 视频探针
npm run probe:agnes:video:poll  # 轮询已有视频 task
npm run probe:agnes:video:t2v   # Case A: 文生视频
npm run probe:agnes:video:i2v-url  # Case B: 图生视频(URL)
npm run probe:agnes:video:i2v-b64  # Case C: 图生视频(b64)
```

## npm 缓存

本地 npm 缓存有权限问题，使用 `--cache ~/.npm-cache-new`。

## 当前状态

- Mock 模式: ✅ 全流程可跑通 (`npm run test:e2e`)
- 真实文本 API: ✅ 已接通（故事/角色/分镜均通过）
- 真实图片 API: ✅ 已接通（角色图+分镜图均生成）
- 真实视频 API: ✅ 已接通并验证完成（task 创建→轮询→completed→下载→ffprobe）
  - ⚠️ 队列延迟较大，非高峰期 ~2min 处理，高峰期可能数小时排队
  - ⚠️ video_url 在 `remixed_from_video_id` 字段（非 `video_url`）
  - ✅ Adapter 已重构为异步模式，支持任务恢复
- 数据库: shot_videos 新增 remote_task_id/remote_status/remote_progress/remote_response_json/last_polled_at 字段

## 开发注意事项

### Next.js 16

本项目使用 **Next.js 16**，存在与旧版本不同的 breaking changes。API 约定、文件结构和惯例可能与训练数据不同。编写代码前参考 `node_modules/next/dist/docs/` 中的指南，注意废弃声明。

关键差异:
- App Router 为默认路由模式
- `params` 在路由处理器中为 `Promise` 类型（需 `await params`）
- Turbopack 为默认开发构建工具
- Server Components 为默认组件模式

### Prisma 7

- `datasource.url` 移至 `prisma.config.ts`
- PrismaClient 构造函数需传入 `adapter` 参数（如 `@prisma/adapter-pg`）

### Agnes Video API

- 视频 URL 位于响应的 `remixed_from_video_id` 字段（非 `video_url` 或 `url`）
- 推荐异步模式: `createVideoTask()` → 保存 `task_id` → `pollVideoTask()` → `downloadVideo()`
- 队列延迟: 非高峰期 ~2min，高峰期可能更久
