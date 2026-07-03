# 环境变量说明

复制 `.env.example` 为 `.env` 并填写实际值。不要提交 `.env` 或任何 API Key。

## 基础配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://manjv:manjv@127.0.0.1:15432/manjv_studio?schema=public` |
| `REDIS_URL` | Redis 连接串；不可用时 SSE 降级 DB 轮询 | `redis://127.0.0.1:16379` |
| `REDIS_KEY_PREFIX` | 共享 Redis 的 key / channel 前缀 | `manjv_studio:` |
| `NODE_ENV` | 运行环境 | `development` |
| `NEXT_PUBLIC_APP_URL` | 前端访问地址 | `http://localhost:3100` |

## 访问控制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `APP_AUTH_REQUIRED` | Basic Auth 开关：`auto` / `true` / `false`。`auto` 下 production 默认开启，development/test 默认关闭 | `auto` |
| `APP_BASIC_AUTH_USER` | Basic Auth 用户名；启用认证时必填 | 空 |
| `APP_BASIC_AUTH_PASSWORD` | Basic Auth 密码；启用认证时必填 | 空 |

生产环境默认 fail-closed：`APP_AUTH_REQUIRED=auto` 且 `NODE_ENV=production` 时，如果未配置用户名或密码，页面和 API 会返回 503，避免固定默认用户的写接口直接暴露到公网。健康检查 `/api/health` 和 `/api/worker/health` 保持不拦截，便于部署平台探活。若部署在受信任内网并由外层网关完成鉴权，可显式设置 `APP_AUTH_REQUIRED=false`。

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
| `ARK_API_BASE_URL` | Ark API 地址配置基准；运行请求前会规范化为 `/api/plan/v3` 前缀 | `https://ark.cn-beijing.volces.com/api/plan` |
| `ARK_API_KEY` | Ark API Key | 必填 |
| `ARK_TEXT_MODEL` | 文本模型 | `doubao-seed-2-0-pro-260215` |
| `ARK_IMAGE_MODEL` | 图片模型 | `doubao-seedream-5-0-260128` |
| `ARK_VIDEO_MODEL` | 视频模型；Medium Agent Plan 默认使用 Seedance 1.5 Pro | `doubao-seedance-1-5-pro-251215` |
| `ARK_VIDEO_RESOLUTION` | 视频分辨率 | `720p` |

文本模型走 OpenAI 兼容 `/chat/completions`；图片和视频走 Ark 专用接口。视频模型为异步任务，创建后由 Worker 轮询。配置中使用 `https://ark.cn-beijing.volces.com/api/plan`，代码会在实际请求前规范化为 `https://ark.cn-beijing.volces.com/api/plan/v3`，因此脚本和运行时不要再硬编码旧的普通 `/api/v3` 默认值。Seedance 2.0 是高套餐/开通后可选能力，当前 Medium Agent Plan 下不可作为默认视频模型。

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
| `UPLOAD_DIR` | 本地开发 local-fs 根目录；FFmpeg/QC 临时目录；探针输出目录 | `./uploads` |
| `PUBLIC_ASSET_BASE_URL` | 公共资源访问前缀 | `http://localhost:3100/assets` |
| `MEDIA_STORAGE_PROVIDER` | 媒体存储 Provider：`local` / `s3` / `aliyun-oss` | `local` |
| `MEDIA_STORAGE_ENABLE_REMOTE` | 是否允许启用远程 S3/OSS provider；默认关闭，避免旧 OSS 配置继续产生费用 | `false` |
| `FFMPEG_PATH` | FFmpeg 可执行文件路径 | `ffmpeg` |
| `FFPROBE_PATH` | ffprobe 可执行文件路径 | `ffprobe` |
| `FFMPEG_NORMALIZE_AUDIO` | 成片阶段是否启用 loudnorm 响度归一化 | `true` |

正式产物的长期身份是 `storageObjectKey`，不是读取 URL。角色图、场景参考图、分镜图、视频片段、最终成片和发布包都应先写入当前媒体存储，再把 `storageObjectKey` / `storageProvider` 写入数据库；API 返回前按需生成 read URL。当前默认低成本模式为 `local-fs`，文件写入 `UPLOAD_DIR/media`，读取 URL 走 `/api/media/...`，不会主动访问 OSS。

如果部署在云平台，`local-fs` 需要挂载持久化磁盘；无持久化磁盘的平台重启后会丢失媒体文件。远程 S3/OSS 仅在明确接受请求费/流量费时启用。

历史远程媒体切回本地默认存储后，可先运行 `npm run data:integrity` 做只读检查。默认模式只读取数据库和 `UPLOAD_DIR/media`，不会请求远程 OSS/S3，也不会输出签名 URL；如存在空壳重复 seed 测试项目，脚本会提示显式 apply 命令，非空项目不会自动删除。写入/下载操作必须直接运行 `npx tsx scripts/repair-data-integrity.ts --apply ...`，不要在默认 `npm run data:integrity` 后追加 `--apply`。若确认接受远程请求/流量成本，可显式运行 `npx tsx scripts/repair-data-integrity.ts --apply --restore-missing-local-media --restore-limit=10`，从数据库中的 legacy URL 分批下载缺失对象到 `UPLOAD_DIR/media`。

### S3-compatible Provider

`MEDIA_STORAGE_PROVIDER=s3` 且 `MEDIA_STORAGE_ENABLE_REMOTE=true` 时使用通用 S3 接口，适合 AWS S3、MinIO、TOS、R2 等兼容服务：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MEDIA_STORAGE_ACCESS_KEY` | S3 access key | 必填 |
| `MEDIA_STORAGE_SECRET_KEY` | S3 secret key | 必填 |
| `MEDIA_STORAGE_REGION` | S3 region | 必填 |
| `MEDIA_STORAGE_BUCKET` | Bucket 名称 | 必填 |
| `MEDIA_STORAGE_ENDPOINT` | 自建或兼容服务 endpoint；AWS S3 可留空 | 空 |
| `MEDIA_STORAGE_FORCE_PATH_STYLE` | MinIO/本地通常为 `true`，OSS/R2/TOS 通常为 `false` | `false` |
| `MEDIA_STORAGE_PUBLIC_BASE_URL` | 可选公共访问前缀；未配置时生成签名 URL | 空 |

### Aliyun OSS Provider

`MEDIA_STORAGE_PROVIDER=aliyun-oss` 且 `MEDIA_STORAGE_ENABLE_REMOTE=true` 时启用阿里云 OSS。Bucket 建议保持私有，服务端用 RAM 用户凭证上传，浏览器和 Ark 读取前由服务端生成 OSS V4 签名 URL。未设置 `MEDIA_STORAGE_ENABLE_REMOTE=true` 时，即使 `.env` 里保留 OSS 配置，运行时也会回退到 `local-fs`。

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OSS_BUCKET` | OSS Bucket 名称 | `manjv-studio` |
| `OSS_REGION` | OSS 地域 | `oss-cn-hangzhou` |
| `OSS_PUBLIC_ENDPOINT` | 公网 endpoint；浏览器与 Ark 必须可访问 | `https://oss-cn-hangzhou.aliyuncs.com` |
| `OSS_INTERNAL_ENDPOINT` | 内网 endpoint；仅阿里云同地域后端可用 | 空 |
| `OSS_USE_INTERNAL_ENDPOINT` | 上传 Client 是否使用内网 endpoint | `false` |
| `OSS_ACCESS_KEY_ID` | RAM access key id，服务端专用 | 必填 |
| `OSS_ACCESS_KEY_SECRET` | RAM access key secret，服务端专用 | 必填 |
| `OSS_SIGNED_URL_EXPIRES_SECONDS` | 私有对象读取签名有效期，范围 300~604800 秒 | `3600` |

本地 Mac 开发或非阿里云同地域部署时，`OSS_USE_INTERNAL_ENDPOINT` 必须保持 `false`。所有 OSS 凭证只能存在服务端环境变量，不要使用 `NEXT_PUBLIC_` 前缀，不要提交 `.env`。
