# 环境变量说明

复制 `.env.example` 为 `.env` 并填写实际值。

## 必要配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://xuegang@localhost:5432/manjv_studio?schema=public` |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379` |
| `NODE_ENV` | 运行环境 | `development` |
| `NEXT_PUBLIC_APP_URL` | 前端地址 | `http://localhost:3000` |

## Mock 模式（当前默认）

| 变量 | 说明 |
|------|------|
| `USE_MOCK_MODEL` | 设为 `true` 使用 Mock 适配器 |

Mock 模式下不需要任何 Agnes API 配置即可完整跑通流程。

## Agnes 模型配置（待接入）

| 变量 | 说明 |
|------|------|
| `AGNES_TEXT_API_BASE_URL` | 文本模型 API 地址 |
| `AGNES_TEXT_API_KEY` | 文本模型 API Key |
| `AGNES_TEXT_MODEL` | 模型名称，默认 `Agnes-2.0-Flash` |
| `AGNES_IMAGE_API_BASE_URL` | 图片模型 API 地址 |
| `AGNES_IMAGE_API_KEY` | 图片模型 API Key |
| `AGNES_IMAGE_MODEL` | 模型名称，默认 `Agnes-Image-2.0-Flash` |
| `AGNES_VIDEO_API_BASE_URL` | 视频模型 API 地址 |
| `AGNES_VIDEO_API_KEY` | 视频模型 API Key |
| `AGNES_VIDEO_MODEL` | 模型名称，默认 `Agnes-Video-2.0` |

## 存储与工具

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `PUBLIC_ASSET_BASE_URL` | 公共资源 URL | `http://localhost:3000/assets` |
| `FFMPEG_PATH` | FFmpeg 路径 | `ffmpeg` |
