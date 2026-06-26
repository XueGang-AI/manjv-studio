# 环境变量说明

复制 `.env.example` 为 `.env` 并填写实际值。不要提交 `.env` 或任何 API Key。

## 基础配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://xuegang@localhost:5432/manjv_studio?schema=public` |
| `REDIS_URL` | Redis 连接串；不可用时 SSE 降级 DB 轮询 | `redis://localhost:6379` |
| `NODE_ENV` | 运行环境 | `development` |
| `NEXT_PUBLIC_APP_URL` | 前端访问地址 | `http://localhost:3000` |

## 模型模式

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `USE_MOCK_MODEL` | `true` 使用 Mock；`false` 使用真实 Ark API | `true` |

规则：

- `USE_MOCK_MODEL=true` 仅用于开发和测试。
- `NODE_ENV=production` 时启用 Mock 会直接报配置错误。
- 真实生产 Provider 固定为 Ark/豆包，新项目写入 `modelProvider=ark`。

## Ark / 火山引擎

当 `USE_MOCK_MODEL=false` 时必须配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ARK_API_BASE_URL` | Ark API 地址 | `https://ark.cn-beijing.volces.com/api/v3` |
| `ARK_API_KEY` | Ark API Key | 必填 |
| `ARK_TEXT_MODEL` | 文本模型 | `doubao-seed-character-251128` |
| `ARK_IMAGE_MODEL` | 图片模型 | `doubao-seedream-5-0-260128` |
| `ARK_VIDEO_MODEL` | 视频模型 | `doubao-seedance-2-0-260128` |
| `ARK_VIDEO_RESOLUTION` | 视频分辨率 | `720p` |

文本模型走 OpenAI 兼容 `/chat/completions`；图片和视频走 Ark 专用接口。视频模型为异步任务，创建后由 Worker 轮询。

## Worker

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WORKER_ID` | Worker 实例标识 | `worker-<pid>` |
| `WORKER_POLL_INTERVAL` | 任务轮询间隔，毫秒 | `3000` |
| `WORKER_CONCURRENCY` | 单 Worker 全局最大并发 | `3` |
| `ENABLE_TEST_TASKS` | 是否注册 `TEST_NOOP` | `NODE_ENV=test` 时自动启用 |

Worker 是独立进程，入口已主动加载 `.env`。生产部署需要单独启动 Web 和 Worker。

## 存储与媒体

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `UPLOAD_DIR` | 本地上传与生成产物目录 | `./uploads` |
| `PUBLIC_ASSET_BASE_URL` | 公共资源访问前缀 | `http://localhost:3000/assets` |
| `FFMPEG_PATH` | FFmpeg 可执行文件路径 | `ffmpeg` |
| `FFPROBE_PATH` | ffprobe 可执行文件路径 | `ffprobe` |

生产环境不要把供应商临时签名 URL 当作正式产物保存；需要转存到项目存储后再写入业务记录。
