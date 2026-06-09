# manjv-studio - AI 漫剧可视化生产工作台

## 项目概述

AI 驱动的漫剧创作平台，核心流程：
用户创建项目 → 输入故事 → 生成故事方案 → 生成角色 → 生成角色图 → 生成分镜 → 生成分镜图 → 生成视频片段 → 合成成片 → 导出

## 技术栈

- Next.js 16 + TypeScript + TailwindCSS
- PostgreSQL + Prisma 7 (使用 @prisma/adapter-pg)
- BullMQ + Redis (异步任务)
- FFmpeg (视频合成，尚未实现)
- Agnes AI 模型 (尚未接入)

## Prisma 7 注意事项

Prisma 7 有 breaking changes：
- schema.prisma 中 datasource 不再有 `url` 字段
- 连接 URL 在 `prisma.config.ts` 中配置
- PrismaClient 构造函数必须使用 `adapter` 参数
- 使用 `@prisma/adapter-pg` 连接 PostgreSQL

## 项目结构

详见 README.md

## 当前阶段

Phase 1 — 项目初始化已完成。
Phase 2 将解析 17 个专业文件并填充 Prompt 模板库。

## npm 缓存注意

本地 npm 缓存有权限问题，使用 `--cache "/Users/xuegang/.npm-cache-new"` 标志。
