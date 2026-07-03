# Manjv Studio

AI 漫剧全流程生产平台 —— 从故事方案到成片 MP4，面向中国短视频平台（抖音/快手）的自动化创作流水线。

固定使用 Ark / 豆包真实模型链路，开发测试可切换 Mock，9 步工作流全部实现：

```
创建项目 → 故事方案 → 角色设定 → 角色图 → 分镜脚本 → 场景参考图 → 分镜图 → 视频片段 → FFmpeg 成片 MP4
```

## 技术栈

- **Next.js 16**（App Router + Turbopack）+ TypeScript + TailwindCSS v4
- **Prisma 7** + PostgreSQL 16（任务状态唯一真相源）
- **Redis**（ioredis，Pub/Sub 事件通知层，可选，不可用时降级 DB 轮询）
- **FFmpeg 8**（视频合成，libx264 + aac）
- **MediaStorage**（默认 local-fs 本地持久化；S3/OSS 仅显式启用时使用）
- **Vitest**（单元测试）

## 系统架构

系统由两个独立进程组成，通过 PostgreSQL 共享任务状态，通过 Redis 推送事件：

```
浏览器
  ↕ SSE（text/event-stream）
Next.js Web 进程（API Routes + Pages）
  ↕ PostgreSQL（任务状态 / 业务数据）
  ↕ Redis Pub/Sub（跨进程事件通知）
Worker 进程（独立，task.worker.ts）
  ↕ AI Adapters（Ark / Mock）
  ↕ FFmpeg（视频合成）
  ↕ MediaStorage（图片 / 视频片段 / 成片 / 发布包）
```

### 关键设计

- **数据库是任务状态的唯一真相源**：所有任务记录在 `generation_tasks` 表，Worker 领取并更新状态。
- **Redis 是低延迟事件通知层**：Worker 完成任务后 `PUBLISH` 事件，Web 进程通过共享 Subscriber 推送到 SSE。Redis 不可用时自动降级到 DB 轮询（3 秒间隔）。
- **Worker 独立进程**：不经过 Next.js，入口 `src/server/workers/task.worker.ts`，独立加载 `.env`。
- **原子任务领取**：`claimTask` 使用条件更新 `WHERE status IN ('pending','retrying')`，PostgreSQL 行级锁防止多 Worker 重复执行同一任务。
- **崩溃恢复**：Worker 启动时及运行期间每 30 秒扫描超时的 `running`/`retrying` 任务，重置为 `pending` 重试或标记 `failed`。
- **媒体对象键是长期身份**：图片、视频片段、最终成片和发布包都写入当前媒体存储，数据库保存 `storageObjectKey` / `storageProvider`；默认本地存储读取 URL 为 `/api/media/...`，不再默认走 OSS。

## 任务链路

所有生成操作创建 `generation_tasks` 记录，状态流转：

```
pending → running → success
                  → failed → (手动 retry) retrying → running → ...
        → cancelled
```

- `pending`：待领取
- `running`：Worker 已领取执行中
- `retrying`：失败后手动重试，等待领取（与 `pending` 一起被领取）
- `success` / `failed` / `cancelled`：终态

生产任务类型：`GENERATE_STORY_PACKAGE`、`GENERATE_CHARACTERS`、`GENERATE_CHARACTER_IMAGES`、`GENERATE_STORYBOARD`、`GENERATE_SCENE_REFERENCES`、`GENERATE_SHOT_IMAGES`、`GENERATE_SHOT_VIDEOS`、`RENDER_FINAL_VIDEO`。`TEST_NOOP` 仅测试环境注册。

每个 Handler 具备幂等保护：原子领取 + 状态检查 + 已有产物跳过，Worker 重启后崩溃恢复的任务不会重复提交远端 AI 任务。

## 快速开始

### Docker 一键启动（推荐体验）

无需本地安装 PostgreSQL / Redis / FFmpeg，一键拉起全部服务（PostgreSQL + Redis + Web + Worker），数据库 schema 同步与 seed 在 Web 容器首次启动时自动完成。

```bash
cp .env.example .env            # 填写 AI Provider 凭证；演示可设 USE_MOCK_MODEL=true
docker compose up -d --build    # 构建并后台启动
open http://localhost:3100

docker compose logs -f web      # 查看启动 / 初始化日志
docker compose down -v          # 停止并清除数据（删除卷）
```

> 镜像基于 `node:24-alpine`，内置 FFmpeg。`DATABASE_URL` / `REDIS_URL` 由 compose 自动指向容器内服务，会覆盖 `.env` 中的同名值。
> 若拉取 `node:24-alpine` 受网络限制，可从镜像源拉取后打官方 tag：`docker pull docker.1ms.run/library/node:24-alpine && docker tag docker.1ms.run/library/node:24-alpine node:24-alpine`。

### 本地开发（无 Docker）

#### 前置依赖

```bash
brew install ffmpeg
pg_isready -h 127.0.0.1 -p 15432 -U manjv -d manjv_studio
redis-cli -h 127.0.0.1 -p 16379 ping
```

本地开发默认使用通用 PostgreSQL / Redis 服务：`postgresql://manjv:manjv@127.0.0.1:15432/manjv_studio?schema=public`、`redis://127.0.0.1:16379`，不再默认占用本机标准数据库与缓存端口。

### 安装与初始化

```bash
npm install --cache ~/.npm-cache-new
cp .env.example .env          # 填写 DATABASE_URL 等
npm run db:push               # 推送 Prisma schema
npm run db:seed               # 种子数据 + Prompt 模板同步
npm run data:integrity        # 只读检查重复 seed 项目与本地媒体文件完整性
```

### 运行

```bash
npm run dev:all               # 同时启动 Web + Worker（推荐开发）
# 或分别启动：
npm run dev                   # 仅 Web
npm run worker                # 仅 Worker
```

生产构建：

```bash
npm run build
npm start                     # Web
npm run worker                # Worker（需单独进程）
```

### 环境变量

见 [docs/ENV.md](docs/ENV.md)。必需 `DATABASE_URL`，推荐 `REDIS_URL`。Mock 模式（`USE_MOCK_MODEL=true`）无需任何 AI API Key 即可跑通全流程。

## 测试

```bash
npm test                      # 单元测试（Vitest）
npm run test:e2e              # Mock 全流程 E2E（22 步）
npm run test:e2e:real         # 真实 AI API + 本地媒体存储全链路：《蓝染球衣上场那天》
npm run test:e2e:real:minimal # 真实 AI API 最小探针（本地 probes 输出，不作为上线验收）
```

当前真实全链路验收脚本使用《蓝染球衣上场那天》，默认检查角色图、场景参考图、分镜图、视频片段、最终成片和发布包均写入 `local-fs`，读取 URL 走 `/api/media/...`。如需远程 S3/OSS，必须同时设置 `MEDIA_STORAGE_PROVIDER` 和 `MEDIA_STORAGE_ENABLE_REMOTE=true`，脚本会按实际 provider 校验。

### Seedance 1.5 Pro 质量优化闭环

当前视频模型继续使用 `doubao-seedance-1-5-pro-251215`。分镜图和视频片段页面支持问题驱动重跑，问题类型包括人物漂移、发型不一致、场景漂移、手机伪 UI/文字、动作过大/手部变形、音频问题和其他。重跑请求会把 `issueTypes`、`fixNote`、`motionStrength`、`clientRequestId` 传给后端，后端统一叠加共享角色/场景/Seedance 一致性约束。

单镜头分镜图重生成采用候选追加模式：新图生成成功后追加候选，不删除旧确认图；用户确认候选后才替换确认态。视频重生成继续保留旧视频候选，并通过 `clientRequestId` 避免网络重试重复提交远端任务。

FFmpeg 成片阶段默认启用 loudnorm 响度归一化，保持原有两阶段输入标准化、无音频补静音和 concat/re-encode 兜底。QC 报告会输出 `issueType`、`severity`、`recommendedAction`，并检查参考图数量、手机屏幕禁用项、成片音轨、响度、黑屏和冻结风险。

AI Provider 连通性探针：

```bash
npm run probe:ark:text        # Ark 文本
npm run probe:ark:image       # Ark 图片
npm run probe:ark:video       # Ark 视频
```

完整探针列表见 `package.json` 的 `probe:*` 脚本。

## 模型适配层

所有 AI 调用必须通过 `adapterFactory`，禁止直接调用 AI API：

```ts
adapterFactory.getTextAdapter(provider)   // ITextAdapter
adapterFactory.getImageAdapter(provider)  // IImageAdapter
adapterFactory.getVideoAdapter(provider)  // IVideoAdapter
```

优先级：`USE_MOCK_MODEL=true` 且非生产 → Mock；其他真实模式固定 Ark。

所有 Prompt 从 `prompt_templates` 数据库表读取，通过 `PromptTemplateService.render()` 填充 `{{variables}}`，禁止硬编码。模板通过 `npm run db:seed` 从 `prompts/` 目录同步。

## 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes
│   ├── projects/             # 项目工作台页面（9 步工作流）
│   └── preview/              # 视觉实验页面（非生产路由）
├── components/               # UI 组件（layout / project / ui / scene-references / shot-* / storyboard / final-preview）
├── hooks/                    # React Hooks
├── lib/                      # utils / prisma client / validators
└── server/
    ├── model-adapters/       # AI 适配器（types → base → mock / ark → factory）
    ├── queues/               # task-queue.service（任务生命周期）
    ├── services/             # prompt-template / ffmpeg / ffmpeg-utils / version / qc
    └── workers/              # task.worker（主循环）+ handlers + task-events（Redis Pub/Sub）+ worker-heartbeat
prisma/                       # schema.prisma + seed
prompts/                      # Prompt 模板源文件 + 素材库 JSON
scripts/                      # E2E 脚本 + AI 探针
docs/                         # 部署与 API 文档
```

## 文档

- [docs/task-worker-deployment.md](docs/task-worker-deployment.md) — Worker 部署、Redis 重连、崩溃恢复、健康检查
- [docs/API.md](docs/API.md) — API 端点参考
- [docs/ENV.md](docs/ENV.md) — 环境变量说明
- [docs/E2E_TEST.md](docs/E2E_TEST.md) — E2E 测试指南
- [docs/ARK_ONLY_CONSISTENCY_REFACTOR_REQUIREMENTS.md](docs/ARK_ONLY_CONSISTENCY_REFACTOR_REQUIREMENTS.md) — Ark-only 一致性自动化需求与验收基线
- [CLAUDE.md](CLAUDE.md) — AI Agent 协作指引与架构约束

## API 返回格式

所有 API 统一返回：

```json
{ "success": true, "data": {} }
{ "success": false, "error": "错误信息" }
```
