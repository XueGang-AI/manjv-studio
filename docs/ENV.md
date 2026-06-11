# 环境变量说明

复制 `.env.example` 为 `.env` 并填写实际值。

## 必要配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://xuegang@localhost:5432/manjv_studio?schema=public` |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379` |
| `NODE_ENV` | 运行环境 | `development` |
| `NEXT_PUBLIC_APP_URL` | 前端地址 | `http://localhost:3000` |

## Mock 模式

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `USE_MOCK_MODEL` | `true`=Mock 适配器, `false`=真实 Agnes API | `true` |

Mock 模式下不需要任何 API 配置即可完整跑通流程（`npm run test:e2e`）。

## Ark / 火山引擎（付费模式）

当 `MODEL_PROVIDER=ark` 且 `USE_MOCK_MODEL=false` 时需配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ARK_API_BASE_URL` | Ark API 地址 | `https://ark.cn-beijing.volces.com/api/v3` |
| `ARK_API_KEY` | Ark API Key | （必填） |
| `ARK_TEXT_MODEL` | 文本模型名称 | `doubao-seed-character-251128` |
| `ARK_IMAGE_MODEL` | 图片模型名称 | `doubao-seedream-5-0-260128` |
| `ARK_VIDEO_MODEL` | 视频模型名称 | `doubao-seedance-1-5-pro-251215` |

Ark 使用 OpenAI 兼容的 `/chat/completions` 接口。图片和视频通过 Ark 专用 API 端点。

## Agnes 模型配置（真实 API 模式）

当 `USE_MOCK_MODEL=false` 时需配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AGNES_TEXT_API_BASE_URL` | 文本模型 API 地址 | `https://apihub.agnes-ai.com/v1` |
| `AGNES_TEXT_API_KEY` | 文本模型 API Key | （必填） |
| `AGNES_TEXT_MODEL` | 模型名称 | `agnes-2.0-flash` |
| `AGNES_IMAGE_API_BASE_URL` | 图片模型 API 地址 | `https://apihub.agnes-ai.com/v1` |
| `AGNES_IMAGE_API_KEY` | 图片模型 API Key | （可与文本共用） |
| `AGNES_IMAGE_MODEL` | 模型名称 | `agnes-image-2.0-flash` |
| `AGNES_VIDEO_API_BASE_URL` | 视频模型 API 地址 | `https://apihub.agnes-ai.com/v1` |
| `AGNES_VIDEO_API_KEY` | 视频模型 API Key | （可与文本共用） |
| `AGNES_VIDEO_MODEL` | 模型名称 | `agnes-video-v2.0` |

### 已验证的 API 配置

- 文本/图片/视频共用一个 API Key
- Base URL: `https://apihub.agnes-ai.com/v1`
- 文本接口: `POST /v1/chat/completions`（OpenAI 兼容格式）
- 图片接口: `POST /v1/images/generations`
- 视频接口: `POST /v1/videos` → `GET /v1/videos/{task_id}`（异步轮询）
- 视频 URL 位于响应的 `remixed_from_video_id` 字段

## 存储与工具

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `PUBLIC_ASSET_BASE_URL` | 公共资源 URL | `http://localhost:3000/assets` |
| `FFMPEG_PATH` | FFmpeg 路径 | `ffmpeg` |
