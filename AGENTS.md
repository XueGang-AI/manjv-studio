# AGENTS.md

本文件为 AI Agent（Codex 等）在本仓库协作时的指引，描述真实架构与不可破坏的约束。

## 项目概述

AI 漫剧全流程生产平台。9 步工作流已全部实现：

```
创建项目 → 故事方案 → 角色设定 → 角色图 → 分镜脚本 → 场景参考图 → 分镜图 → 视频片段 → FFmpeg 成片 MP4
```

面向中国短视频平台（抖音/快手），真实生产只保留 Ark/豆包模型链路，Mock 仅用于非生产测试。

## 技术栈

- **Next.js 16** + TypeScript + TailwindCSS v4（Turbopack）
- **Prisma 7** + PostgreSQL 16 — `datasource.url` 在 `prisma.config.ts`，不在 schema 里
- **FFmpeg 8**（视频合成，libx264 + aac）
- **Vitest**（单元测试）
- **MediaStorage**：当前默认 `local-fs` 本地持久化，远程 S3/OSS 仅在显式启用时使用
- AI: Ark/豆包系列，通过 AdapterFactory 统一调用

## 进程架构（核心）

系统由两个独立进程组成，**修改任一进程的运行链路前必须理解整体**：

```
浏览器 ──SSE──> Next.js Web 进程 ──> PostgreSQL（任务状态真相源）
                                  └──> Redis Pub/Sub（事件通知）
Worker 进程（独立）──> AI Adapters + FFmpeg
```

- **Web 进程**：API Routes + Pages。持有 Redis Subscriber（SSE 需要）和 Heartbeat（Health API），Publisher 按需初始化。
- **Worker 进程**：入口 `src/server/workers/task.worker.ts`，独立运行，不经过 Next.js，**不会自动加载 `.env`**（入口已 `dotenv.config()`）。持有 Publisher + Heartbeat，无 Subscriber。
- **PostgreSQL**：任务与业务数据唯一真相源。
- **Redis**：低延迟事件通知层，可选。不可用时 SSE 自动降级到 DB 轮询（3 秒间隔）。

## 任务系统（Task System）

### 状态流转

```
pending → running → success
                  → failed → (手动 retry) retrying → running → ...
        → cancelled
```

- `pending` / `retrying`：等待领取（`pollOnce` / `claimTask` 同时领取两者）
- `running`：Worker 已领取执行中
- `success` / `failed` / `cancelled`：终态

### 任务类型（注册在 `TASK_TYPE_REGISTRY`）

| 类型 | Handler | 并发 | 超时 |
|------|---------|------|------|
| `GENERATE_STORY_PACKAGE` | story-package.handler | 2 | 10min |
| `GENERATE_CHARACTERS` | characters.handler | 2 | 10min |
| `GENERATE_CHARACTER_IMAGES` | character-images.handler | 1 | 20min |
| `GENERATE_STORYBOARD` | storyboard.handler | 2 | 10min |
| `GENERATE_SCENE_REFERENCES` | scene-references.handler | 1 | 15min |
| `GENERATE_SHOT_IMAGES` | shot-images.handler | 1 | 15min |
| `GENERATE_SHOT_VIDEOS` | shot-videos.handler | 1 | 35min |
| `RENDER_FINAL_VIDEO` | final-render.handler | 1 | 10min |
| `TEST_NOOP` | test-noop.handler | 5 | 1min（仅测试环境注册） |

### 关键机制（不可破坏）

1. **原子领取防重复执行**：`claimTask` 用 `updateMany WHERE status IN ('pending','retrying')`，PostgreSQL 行级锁保证同一任务同一时刻只被一个 Worker 领取。**不得改为非原子领取。**
2. **崩溃恢复**：`recoverStaleTasks` 在 Worker 启动时 + 主循环每 30 秒执行，扫描超时的 `running`/`retrying` 任务。`retrying` 任务不递增 `retryCount`（从未被领取执行），`running` 任务递增（执行失败）。**不得移除定期恢复或改变 retryCount 语义。**
3. **幂等保护**：每个 Handler 入口检查任务状态 + 已有产物跳过。`SHOT_VIDEOS` 通过 `remoteTaskId` 持久化避免重复提交远端视频任务。**崩溃恢复后不得重复提交远端任务。**
4. **Redis 自动重连**：Publisher / Subscriber / Heartbeat 三连接均无限重试。Subscriber `ready` 后自动重新订阅 `refCount > 0` 的频道。Publisher `end` 事件重置缓存以便重建。**不得改回有限重试（会导致 Redis 重启后永久死亡）。**
5. **优雅关闭**：SIGTERM/SIGINT 后停止领取新任务，等待运行中任务完成（最多 30s），写 `shutting_down` heartbeat，删除 heartbeat key，关闭连接。未完成任务保持 `running`，下次启动由崩溃恢复回收。
6. **SSE 频道引用计数**：每个 SSE 客户端订阅项目频道 +1，断开 -1，归零时 `unsubscribe` Redis 频道，防止频道集合增长。

### 任务相关文件

- `src/server/workers/task.worker.ts` — Worker 主循环、原子领取、崩溃恢复、优雅关闭
- `src/server/workers/task-events.ts` — Redis Pub/Sub + 共享 Subscriber + 引用计数频道管理
- `src/server/workers/worker-heartbeat.ts` — Worker 心跳（Redis key，10s 写入，30s TTL）
- `src/server/workers/handlers/*.handler.ts` — 各任务类型 Handler
- `src/server/queues/task-queue.service.ts` — TaskService（创建/开始/完成/失败/重试/取消/删除）
- `src/app/api/projects/[id]/tasks/stream/route.ts` — SSE 端点

## 关键架构原则

### 1. 模型适配层（核心抽象）

所有 AI 调用必须通过 `adapterFactory`：

```ts
adapterFactory.getTextAdapter(provider)   // ITextAdapter
adapterFactory.getImageAdapter(provider)  // IImageAdapter
adapterFactory.getVideoAdapter(provider)  // IVideoAdapter
```

优先级：`USE_MOCK_MODEL=true` 且非生产 → Mock；其他情况 → Ark。生产环境设置 `USE_MOCK_MODEL=true` 会直接报配置错误。**禁止绕过 AdapterFactory 直接调用 AI API。**

适配器文件位于 `src/server/model-adapters/`：
- `types.ts` — 接口定义（ITextAdapter / IImageAdapter / IVideoAdapter）+ `AdapterError` 结构化错误
- `base.adapter.ts` — 共享 `normalizeStatus()` / `createAdapterError()`
- `adapter.factory.ts` — AdapterFactory 单例
- `mock/` — Mock 适配器（1s 延迟 + 硬编码数据，仅非生产）
- `ark/` + 根目录 `ark-*.adapter.ts` — Ark 适配器

所有适配器错误统一为 `AdapterError`（`code` / `message` / `retryable` / `statusCode`），`retryable` 按 HTTP 状态判断（5xx / 429 可重试）。

### 2. Ark-only 生产架构

- **Ark（火山引擎/豆包）**：唯一真实生产 Provider，需 `ARK_API_KEY`
- 项目级 `model_provider` 字段保留兼容历史数据，新项目固定写入 `ark`
- `modelName` 统一通过 `getRuntimeModelName(type)` 解析，禁止散落 provider 三元判断
- Mock 仅用于开发/测试，生产环境禁止启用

### 3. Prompt 模板化

所有 Prompt 从 `prompt_templates` 数据库表读取，通过 `PromptTemplateService.render()` 填充 `{{variables}}`。**禁止硬编码 Prompt。** 模板通过 `npm run db:seed` 从 `prompts/` 目录同步。

### 4. 任务记录

所有生成操作写入 `generation_tasks` + `task_logs` 表。TaskService 管理完整生命周期。

### 5. 版本管理

关键确认节点调用 `versionService.createVersion()` 自动保存项目快照，支持回滚与 diff 对比。

### 6. API 统一格式

所有 API 返回：`{success: true, data: T}` 或 `{success: false, error: string}`

### 7. Duration 一致性

`snapShotDuration()`（`src/lib/utils.ts`）确保 DB 存储时长与实际视频匹配。分镜生成时 `getMaxShotDuration()` + `splitOversizedShots()` 从源头约束镜头时长。

### 8. 角色一致性系统

多角度参考图（front_full_body / front_half_body / left_side / right_side / back_view），锚点图先行，去重、失败重试（指数退避 ×3）、先成后删。分镜图与视频生成必须真实传入匹配角色的 `referenceImages`，同时保留角色文字外貌描述。

### 9. 场景一致性系统

分镜图生成前必须先建立 `Scene` / `SceneImage` 场景资产层。场景参考图由 `GENERATE_SCENE_REFERENCES` Worker 任务生成，分镜图和视频生成都要传入当前镜头绑定场景的参考图，保证同一地点、时间、构图基调稳定。

### 10. FFmpeg 成片

`src/server/services/ffmpeg.service.ts` 使用两阶段法：先 `normalizeInput()` 将每个输入标准化到统一规格（letterbox padding 居中填充，不裁切人物；统一 H.264 / AAC 44100Hz / yuv420p / 固定帧率；无音频输入补静音音轨），再 concat（`-c copy`，失败回退 re-encode），最后默认执行 loudnorm 响度归一化。解决异构分辨率（如 496×864 + 1280×768）concat `exit=254` 问题。`ffmpeg-utils.ts` 提供 ffprobe 校验与安全 spawn。

### 11. 自动 QC 与发布包

规则 QC 由 `qcService` 执行。QC issue 输出 `issueType`、`severity`、`recommendedAction`，覆盖参考图数量、手机屏幕禁用项、成片音轨、响度、黑屏和冻结风险。`/automation/auto-confirm` 在 QC 达标后自动确认角色图、分镜图、视频片段；缺少未来阶段产物时不阻断当前阶段自动确认。`/release-package/generate` 在成片完成后生成发布 manifest，并写回 `FinalVideo.assetPackageUrl`。

### 12. 媒体存储默认本地化

当前成本策略是 **默认不使用 OSS**。`MEDIA_STORAGE_PROVIDER=local` 写入 `UPLOAD_DIR/media`，API 读取走 `/api/media/...`。远程 `s3` / `aliyun-oss` 即使配置了凭证，也必须额外设置 `MEDIA_STORAGE_ENABLE_REMOTE=true` 才会生效，避免旧 OSS 配置继续产生请求费和公网流量费。若部署到云环境，必须为 `UPLOAD_DIR` 挂载持久化磁盘，否则重启会丢失媒体文件。

## 不可破坏的约束

修改以下任一处前必须完整理解其上下文，**禁止为优化而破坏既有正确逻辑**：

- ❌ Worker 主循环、原子领取、崩溃恢复、retryCount 语义
- ❌ Redis Pub/Sub 三连接的无限重试与自动重订阅
- ❌ SSE 频道引用计数与事件去重（eventId）
- ❌ FFmpeg 两阶段规范化法（不得改回裸 concat）
- ❌ 各 Handler 的幂等保护与远端任务去重
- ❌ AdapterFactory 调用入口（不得绕过直接调 AI API）
- ❌ Prompt 模板化（不得硬编码 Prompt）
- ❌ 数据库 schema（Prisma migration 需可回滚，先说明风险）
- ❌ `.env` / API Key（不读取、不显示、不提交、不记录）

## 开发注意事项

### Next.js 16

- `params` 在路由处理器中为 `Promise` 类型：`const { id } = await params`
- Server Components 为默认模式
- `npm run build` 可能因 Google Fonts 网络不可达而失败

### Prisma 7

- Schema 变更后：`npx prisma generate` + `npm run db:push`
- PrismaClient 需要 `adapter` 参数：`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`
- Datasource URL 配置在 `prisma.config.ts`，不在 `schema.prisma`

### Ark（火山引擎/豆包）

- 文本模型 `doubao-seed-2-0-pro-260215`：OpenAI 兼容 `/chat/completions`
- 图片模型 `doubao-seedream-5-0-260128`
- 视频模型 `doubao-seedance-1-5-pro-251215`：当前 Medium Agent Plan 默认视频模型，异步任务（创建 → 轮询 → 下载），图生视频时长按 4~12s 整数约束。Seedance 2.0 是高套餐/开通后可选能力，不作为 Medium 默认值
- 环境变量：`ARK_API_KEY` + `ARK_API_BASE_URL`（默认配置为 `https://ark.cn-beijing.volces.com/api/plan`，运行请求前规范化为 `/api/plan/v3` 前缀）
- Ark 视频 URL 位于轮询响应 `content.video_url` 路径

## 快速命令

```bash
npm run dev:all                # Web + Worker（开发）
npm run dev                    # 仅 Web
npm run worker                 # 仅 Worker
npm test                       # 单元测试
npm run test:e2e               # Mock 全流程 E2E
npm run test:e2e:real          # 真实 API 最小闭环
npm run db:push                # 推送 Prisma schema
npm run db:seed                # 种子数据 + Prompt 模板
npm run db:studio              # Prisma Studio
npm run lint                   # ESLint
# AI 探针：npm run probe:ark:text / probe:ark:image / probe:ark:video
```

**npm 缓存**：本地有权限问题，使用 `npm install --cache ~/.npm-cache-new`。

## 已知问题

- ⚠️ `npm run build` 可能因 Google Fonts 网络不可达而失败

## 禁止提交

- `.env` / `uploads/` / `scripts/output/` / `screenshots/` / `public/` / `.Codex/`（已 .gitignore）
- 任何包含 API Key（`sk-` 等）的文件
- 视频/图片产物
