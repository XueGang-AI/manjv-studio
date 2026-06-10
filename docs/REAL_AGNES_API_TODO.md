# 真实 Agnes API 接入 TODO

## 当前状态

Mock 模式 (`USE_MOCK_MODEL=true`) 已完整跑通整个生产流程。

真实模式 (`USE_MOCK_MODEL=false`)：
- **文本模型**: ✅ 已完全接通，故事/角色/分镜全部真实生成成功
- **图片模型**: ✅ 已完全接通，角色图+分镜图全部真实生成成功
- **视频模型**: ✅ 已接通并验证，task 创建→轮询→completed→下载→ffprobe 全流程通过
  - ⚠️ 队列延迟较大（非高峰期 ~2min 处理，高峰期可能数小时排队）
  - ✅ video_url 在 `remixed_from_video_id` 字段
  - ✅ 适配器已重构为异步模式（create + poll + download）

## 文本模型 Agnes-2.0-Flash

| 项目 | 状态 |
|------|------|
| AGNES_TEXT_API_BASE_URL | ✅ `https://apihub.agnes-ai.com/v1` |
| AGNES_TEXT_API_KEY | ✅ 已配置 |
| 请求格式 | ✅ OpenAI Chat Completions 兼容 |
| JSON 输出支持 | ✅ `response_format: {type: "json_object"}` |
| 真实调用 | ✅ 已验证（故事/角色/分镜） |
| 中文支持 | ✅ 正常 |

## 图片模型 Agnes-Image-2.0-Flash

| 项目 | 状态 |
|------|------|
| AGNES_IMAGE_API_BASE_URL | ✅ `https://apihub.agnes-ai.com/v1` |
| AGNES_IMAGE_API_KEY | ✅ 已配置（与文本共用 key） |
| reference_images 支持 | ✅ 字段名存在，待实测效果 |
| negative_prompt 支持 | ✅ 支持 |
| num_outputs 支持 | ✅ 1-4 正常 |
| seed 支持 | ✅ 支持 |
| 返回格式 | ✅ URL + b64_json |
| response_format: b64_json | ❌ 不支持（400 错误），需从 URL 下载转换 |
| style 参数 | ❌ 不支持（400 错误），已从 Adapter 移除 |
| size 参数 | ❌ 不支持（500 错误），使用 aspect_ratio |
| 真实调用 | ✅ 已验证（角色图+分镜图） |

## 视频模型 Agnes-Video-V2.0

| 项目 | 状态 |
|------|------|
| AGNES_VIDEO_API_BASE_URL | ✅ `https://apihub.agnes-ai.com/v1` |
| AGNES_VIDEO_API_KEY | ✅ 已配置（与文本/图片共用 key） |
| image_to_video 支持 | ✅ task 创建成功（传 image URL） |
| input_image 传递方式 | ✅ URL；⚠️ base64 data URI 待确认 |
| duration 支持 | ✅ 5s 正常 |
| aspect_ratio | ✅ 支持 `9:16`（实际输出分辨率待确认） |
| 返回格式 | ✅ task_id + status + progress |
| 同步/异步 | ✅ 异步，需 poll |
| poll endpoint | ✅ `GET /v1/videos/{task_id}` |
| video_url 字段名 | ✅ `remixed_from_video_id`（⭐ 关键发现） |
| 真实调用 | ✅ 已验证：创建→排队→completed→下载→ffprobe |
| 视频质量 | ✅ h264+aac, 24fps, 1280×768, 5.04s, 1.3MB |

## Adapter 更新 (2026-06-10)

AgnesVideoAdapter 已重构，新增方法：

| 方法 | 说明 |
|------|------|
| `generate()` | 原有同步接口（内部调 create + wait，向后兼容） |
| `createVideoTask()` | 创建异步任务，立即返回 task_id |
| `pollVideoTask()` | 单次轮询，返回状态+video_url |
| `waitForVideoCompletion()` | 阻塞等待 + 超时 + 进度回调 |
| `downloadVideo()` | 下载视频到本地路径 |

## 数据库更新 (2026-06-10)

shot_videos 表新增远端任务跟踪字段：
- `remote_task_id` — Agnes 视频任务 ID
- `remote_status` — queued/processing/completed/failed/timeout
- `remote_progress` — 0-100
- `remote_response_json` — 最后一次 poll 响应
- `last_polled_at` — 最后轮询时间

前端新增 `/check-task` API 用于手动触发轮询。

## 接真实 API 后重点测试

1. ✅ 文本模型 JSON 输出稳定性（严格 JSON，无 markdown）
2. ⚠️ 图片模型角色一致性（同一角色的多张候选图相似度）
3. ⚠️ 视频模型动态自然度（人物脸部变形程度）
4. ✅ API 超时和重试策略（已实现 create + poll + wait + 继续轮询）
5. ⚠️ 并发限制（图片/视频 API QPS 限制）
6. ⚠️ 成本控制（每张图/每段视频的 token 消耗）
7. ⚠️ 视频队列延迟（非高峰期 ~2min，高峰期可能数小时）
