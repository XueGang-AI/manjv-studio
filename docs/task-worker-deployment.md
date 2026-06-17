# Task Worker 部署文档

## 架构概览

```
Frontend (Browser)
  ↕ SSE
Next.js (API Routes)
  ↕ PostgreSQL
  ↕ Redis Pub/Sub
Worker (独立进程)
  ↕ AI Adapters
  ↕ FFmpeg
```

- **数据库（PostgreSQL）是任务状态的唯一真相源**
- **Redis 是低延迟事件通知层**，不可用时自动降级到 DB 轮询（3 秒间隔）
- **Worker 与 Next.js 是独立进程**，通过 DB 领取任务，通过 Redis 推送事件
- **Redis 频道使用引用计数管理**，SSE 客户端断开后自动取消订阅
- **Redis 自动重连**：Subscriber/Publisher/Heartbeat 均支持 Redis 断开后自动重连，无需重启进程

## 进程启动命令

### Web 进程

```bash
npm run dev          # 开发
npm start            # 生产
```

### Worker 进程

```bash
npm run worker       # 单 Worker
```

### 开发组合启动

```bash
npm run dev:all      # 同时启动 Next.js + Worker（Ctrl+C 同时终止）
```

`dev:all` 使用 `scripts/dev-all.sh`，确保：
- Ctrl+C 同时终止 Web 和 Worker 进程
- 任一子进程异常退出时终止另一个
- 无残留进程

## Redis

### 是否必需

**非必需，但强烈推荐。**

- 有 Redis：Worker 事件通过 Pub/Sub 实时推送到 SSE，延迟 <100ms
- 无 Redis：SSE 依赖数据库轮询（3 秒间隔），延迟 3-5 秒

### 配置

```env
REDIS_URL=redis://localhost:6379
```

不设置 `REDIS_URL` 或 Redis 不可用时，系统自动降级到 DB 轮询，无需额外配置。

### Redis 自动重连

Redis 断开后，所有连接自动重连，无需重启 Web 或 Worker 进程：

| 连接 | 重连策略 | 恢复后行为 |
|------|----------|-----------|
| Publisher | 无限重试，间隔 500ms-3s | 恢复后事件自动切回 source=redis |
| Subscriber | 无限重试，间隔 500ms-5s | 恢复后自动重新订阅所有活跃频道 |
| Heartbeat | 无限重试，间隔 1s-5s | 恢复后自动写入 heartbeat key |

**Subscriber 重新订阅机制**：
- Redis Subscriber 进入 `ready` 状态时，自动遍历所有 `refCount > 0` 的频道并重新 subscribe
- `refCount = 0` 的频道不会被重新订阅
- ioredis 的 subscribe 操作保证幂等，多次调用不会重复订阅
- 重连后事件不重复（eventId 去重）

**限制**：
- Redis 断开期间的事件无法重放（DB fallback 事件是快照，不是增量）
- 如果 Redis 完全不可达（非临时断开），连接可能长时间处于 reconnecting 状态
- 极端情况下（Redis 长时间不可达后恢复），可能需要手动刷新 SSE 连接

## 数据库要求

- PostgreSQL 16+
- `generation_tasks` 表（由 Prisma 管理）
- 无需额外索引变更

## 环境变量

### 必需

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

### 推荐

```env
REDIS_URL=redis://localhost:6379
```

### Worker 可选

```env
WORKER_POLL_INTERVAL=3000    # 轮询间隔 ms（默认 3000）
WORKER_CONCURRENCY=3         # 全局最大并发（默认 3）
WORKER_ID=worker-1           # Worker 标识（默认自动生成）
```

### FFmpeg

```env
FFMPEG_PATH=/usr/local/bin/ffmpeg   # FFmpeg 路径
FFPROBE_PATH=/usr/local/bin/ffprobe # ffprobe 路径
UPLOAD_DIR=./uploads                # 上传目录
```

## Worker 数量建议

| 场景 | Worker 数量 | 说明 |
|------|-------------|------|
| 开发 | 1 | 足够 |
| 小规模生产 | 1-2 | 全局并发限制 3-6 |
| 中规模生产 | 2-3 | 需注意 FFmpeg 并发限制 |

**注意**：FINAL_RENDER 并发上限为 1（受 FFmpeg 安全信号量限制），增加 Worker 数不会提高渲染并发。

## Worker Heartbeat

Worker 每 10 秒写入 Redis key `worker:heartbeat:<workerId>`，TTL 30 秒。

### Heartbeat 数据

```json
{
  "workerId": "worker-12345",
  "pid": 12345,
  "status": "running",
  "activeTasks": 2,
  "updatedAt": "2026-06-16T03:15:25.183Z"
}
```

- 不包含密钥、任务 payload、服务器路径
- Worker 优雅退出时写入 `shutting_down` 状态并删除 key
- Redis 不可用时 heartbeat 写入静默失败，不影响 Worker 运行

### 判定规则

| 条件 | 状态 |
|------|------|
| key 存在且 status=running | Worker 存活 |
| key 存在且 status=shutting_down | Worker 正在关闭 |
| key 不存在（已过期） | Worker 不存活或 Redis 不可达 |

**注意**：Redis 不可达时 heartbeat key 无法写入和读取，Health API 将 Worker 状态标记为 `unknown`（非 `unhealthy`）。

## SSE 连接要求

- Content-Type: `text/event-stream`
- 反向代理**不得缓冲 SSE**（Nginx 需设置 `proxy_buffering off` 或 `X-Accel-Buffering: no`）
- 客户端支持 `EventSource` API

### Nginx 配置示例

```nginx
location /api/projects/([^/]+)/tasks/stream {
    proxy_pass http://upstream;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
    proxy_read_timeout 300s;
}
```

### 超时设置

- SSE 连接建议超时 ≥ 300 秒
- Worker 任务超时：10-35 分钟（按任务类型）
- API 请求超时：30 秒（创建任务请求很快返回）

## 优雅关闭

Worker 收到 SIGTERM/SIGINT 后：

1. 停止领取新任务
2. 写入 `shutting_down` heartbeat
3. 等待运行中任务完成（最多 30 秒）
4. 删除 heartbeat key
5. 关闭 Redis 连接（Publisher + Heartbeat）
6. 断开数据库连接
7. 退出

未完成的任务保持 `running` 状态，下次 Worker 启动时自动回收。

## 健康检查

### 综合健康端点

```bash
curl http://localhost:3000/api/worker/health
```

返回示例：
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "database": { "status": "ok", "latency": 5 },
      "redis": { "status": "ok", "latency": 2 },
      "worker": { "status": "ok", "note": "1 worker(s) found" }
    },
    "workers": [
      {
        "workerId": "worker-12345",
        "pid": 12345,
        "status": "running",
        "activeTasks": 0,
        "updatedAt": "2026-06-16T03:15:25.183Z"
      }
    ]
  }
}
```

### 健康语义

| 状态 | 含义 | 影响范围 |
|------|------|----------|
| `healthy` | DB + Redis + Worker heartbeat 均正常 | 全功能可用 |
| `degraded` | DB 正常，但 Redis 或 Worker heartbeat 异常 | SSE 降级到 DB 轮询，Worker 可能不存活 |
| `unhealthy` | DB 不可用 | 系统不可用 |

### 注意

- Redis 检查通过**主动 PING** 验证，不仅检查内存标志
- Worker heartbeat 通过 Redis key 检查，Redis 不可达时 Worker 状态为 `unknown`
- HTTP 状态码：200（healthy/degraded）、503（unhealthy）

## 日志

Worker 日志输出到 stdout/stderr，格式：

```
[worker] Task Worker starting...
[worker] Worker ID: worker-12345
[worker] Heartbeat started (interval=10s, TTL=30s)
[worker] Processing task xxx (type=GENERATE_STORYBOARD, concurrency=1/2)
[worker:storyboard] Task xxx completed
[worker:final-render] Task xxx failed: code=RENDER_FAILED, internal=...
[worker] Recovered stale task xxx → pending (retry 1/3)
[worker] Cleaned up 3 stale TEST_NOOP tasks
```

建议使用日志聚合工具（如 Docker logs、PM2 logs）收集。

## 崩溃恢复

Worker 在**启动时**和**运行期间每 30 秒**自动扫描超时的 `running`/`retrying` 任务：

| 任务类型 | 超时时间 | 说明 |
|---------|---------|------|
| GENERATE_STORYBOARD | 10 分钟 | 含 AI 调用 |
| GENERATE_SHOT_IMAGES | 15 分钟 | 含多次 AI 调用 |
| GENERATE_SHOT_VIDEOS | 35 分钟 | 含远程轮询等待 |
| RENDER_FINAL_VIDEO | 10 分钟 | FFmpeg 合成 |

超时任务处理：
- `retryCount < maxRetries` → 重置为 `pending`，等待重新领取
- `retryCount >= maxRetries` → 标记为 `failed`
- 自动恢复项目业务状态（避免用户卡在 GENERATING）

### 定期恢复（Phase 4.6 新增）

`recoverStaleTasks` 不仅在启动时执行，主循环每 30 秒调用一次。这解决了 **handler 挂起但 Worker 未崩溃**（如远端 API 无响应、网络阻塞）导致的 stuck `running` 任务——这类任务不会触发进程重启，必须靠定期扫描回收。

### retrying 任务的处理

手动重试（`retryTask`）将任务置为 `retrying` 状态，`pollOnce` 和 `claimTask` 同时领取 `pending` 和 `retrying`。这避免了之前手动重试任务成为孤儿的问题。

`recoverStaleTasks` 对 `retrying` 任务**不递增 retryCount**（因为从未被领取执行，超时只是因为 Worker 离线），而对 `running` 任务递增（执行失败）。这避免了 retryCount 双重计算导致过早达到 maxRetries。

### 原子领取防止重复执行

`claimTask` 使用条件更新 `WHERE status IN ('pending','retrying')`，PostgreSQL 行级锁保证同一任务在同一时刻只被一个 Worker 领取成功。多个 Worker 并发领取同一任务时，只有一个返回 `count > 0`。

## 生产环境 TEST_NOOP 清理

生产环境中 TEST_NOOP handler 不会注册，但数据库中可能存在遗留的 pending/retrying/running TEST_NOOP 任务。Worker 启动时自动审计并清理：

- 条件：`NODE_ENV=production` 且 `isTestTaskEnabled()=false`
- 操作：将 `status in (pending, retrying, running)` 的 TEST_NOOP 任务标记为 `failed`
- 错误信息：`[TEST_TASK_DISABLED] 测试任务在生产环境不可执行`
- 只处理 TEST_NOOP 类型，不影响其他任务
- 不删除记录，保留审计轨迹

## 重要注意事项

### Worker 环境变量

Worker 作为独立进程运行，**不会自动加载 `.env`**。入口文件已添加 `dotenv.config()` 确保环境变量加载。

生产环境需确保 `DATABASE_URL`、`REDIS_URL` 等变量通过环境注入或 `.env` 文件可访问。

### Redis 连接管理

- Publisher：1 个共享连接（按需初始化，无限重试）
- Subscriber：1 个共享连接（按需初始化，无限重试，自动重新订阅）
- Heartbeat：1 个专用连接（按需初始化，无限重试）
- 频道引用计数：每个 SSE 客户端订阅项目时 +1，断开时 -1
- 引用归零时自动 unsubscribe Redis 频道，防止频道集合增长
- Worker 进程有 Publisher 和 Heartbeat，没有 Subscriber
- Web 进程有 Subscriber（SSE 需要）和 Heartbeat（Health API），Publisher 按需初始化

### 事件去重

- Redis 事件通过 `eventId` 去重（SSE 端维护最近 100 个已发送 eventId）
- DB fallback 事件是独立格式（`update` 类型），不与 Redis 事件重复
- 前端 Hook 维护 `seenEventIds` Set（最近 50 个）

### SSE 断线重连

- 浏览器原生 EventSource 自动携带 `Last-Event-ID` 重连
- SSE Route 解析 Last-Event-ID 中的时间戳，推送 `updatedAt > since` 的增量快照
- 中间 progress 值无法重放（数据库只保留最新状态）
- curl 不具备浏览器自动重连行为，需手动携带 `Last-Event-ID` header

### AI 任务幂等性保护

| Handler | 保护层级 | 远端任务幂等 |
|---------|----------|-------------|
| STORYBOARD | 原子领取 + 状态检查 | 同步 API，无需远端幂等 |
| SHOT_IMAGES | 原子领取 + 状态检查 + 已有图片跳过 | 同步 API，已有 ShotImage 的镜头跳过 |
| SHOT_VIDEOS | 原子领取 + 状态检查 + remoteTaskId 持久化 | 异步 API，已有 remoteTaskId 的镜头跳过创建 |
| FINAL_RENDER | 原子领取 + 状态检查 + output 检查 | FFmpeg 本地执行 |

**SHOT_VIDEOS 幂等性**：
- 镜头已有 ShotVideo 且带 remoteTaskId → 跳过创建，直接进入轮询
- Worker 重启后崩溃恢复的任务不会重复提交远端视频任务
- 远端任务状态通过 `remoteStatus` 追踪

### Ark 视频 URL 提取

Ark API 轮询响应中视频 URL 位于 `content.video_url` 路径（非顶层），适配器按以下优先级提取：
1. `content.video_url`（实际观察路径）
2. `data.video_url`
3. `data.url`
4. `data.output_url`
5. `data.data.video_url`
6. `data.data.url`

## FFmpeg 依赖

- FFmpeg 8+（需支持 libx264、aac）
- ffprobe（用于视频校验）
- 通过 `FFMPEG_PATH` / `FFPROBE_PATH` 指定路径
- macOS: `brew install ffmpeg`
- Ubuntu: `apt install ffmpeg`
