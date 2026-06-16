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
- **Redis 是低延迟事件通知层**，不可用时自动降级到 DB 轮询
- **Worker 与 Next.js 是独立进程**，通过 DB 领取任务，通过 Redis 推送事件

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
npm run dev:all      # 同时启动 Next.js + Worker
```

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
2. 等待运行中任务完成（最多 30 秒）
3. 关闭 Redis 连接
4. 断开数据库连接
5. 退出

未完成的任务保持 `running` 状态，下次 Worker 启动时自动回收。

## 健康检查

Worker 进程存活即为健康。建议：

```bash
# 简单存活检查
pgrep -f "task.worker.ts" > /dev/null
```

数据库健康检查通过 Prisma 连接池自动处理。

## 日志

Worker 日志输出到 stdout/stderr，格式：

```
[worker] Task Worker starting...
[worker] Processing task xxx (type=GENERATE_STORYBOARD, concurrency=1/2)
[worker:storyboard] Task xxx completed
[worker:final-render] Task xxx failed: code=RENDER_FAILED, internal=...
[worker] Recovered stale task xxx → pending (retry 1/3)
```

建议使用日志聚合工具（如 Docker logs、PM2 logs）收集。

## 崩溃恢复

Worker 启动时自动扫描超时的 `running` 任务：

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

## FFmpeg 依赖

- FFmpeg 8+（需支持 libx264、aac）
- ffprobe（用于视频校验）
- 通过 `FFMPEG_PATH` / `FFPROBE_PATH` 指定路径
- macOS: `brew install ffmpeg`
- Ubuntu: `apt install ffmpeg`
