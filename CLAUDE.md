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
npm run dev          # 启动 (需要 DATABASE_URL)
npm test             # 18 unit tests
npm run test:e2e     # Mock 全流程 (20 steps → MP4)
npm run db:push      # 推送 Prisma schema
npm run db:seed      # 种子数据
```

## npm 缓存

本地 npm 缓存有权限问题，使用 `--cache ~/.npm-cache-new`。

## 当前状态

- Mock 模式: ✅ 全流程可跑通 (`npm run test:e2e`)
- 真实 API: 文本 ✅ 图片 ✅ 视频 ⚠️ (队列耗时 >10min)
