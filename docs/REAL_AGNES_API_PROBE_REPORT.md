# 真实 Agnes API 探针与闭环测试报告

## 基础配置

| 项目 | 值 |
|------|-----|
| base_url | `https://apihub.agnes-ai.com/v1` |
| text_model | `agnes-2.0-flash` |
| image_model | `agnes-image-2.0-flash` |
| video_model | `agnes-video-v2.0` |
| auth_header | `Authorization: Bearer <API_KEY>` |

## 探针结果

| 探针 | 端点 | 状态码 | 结果 |
|------|------|--------|------|
| text_probe | `/chat/completions` | 200 | ✅ JSON 输出正常 |
| image_probe | `/images/generations` | 200 | ✅ 返回 `url` + `b64_json` |
| video_probe | `/videos` (create) | 200 | ✅ 返回 `task_id` |

## 文本模型 Agnes-2.0-Flash

### 验证结果

- **JSON 输出**: ✅ 严格 JSON，无 markdown
- **中文支持**: ✅ 正常
- **System Prompt**: ✅ 支持
- **response_format**: ✅ `{type: "json_object"}`
- **实际测试**: 故事方案、角色设定、分镜脚本全部真实生成成功

### 请求格式

```json
POST /v1/chat/completions
{
  "model": "agnes-2.0-flash",
  "messages": [...],
  "temperature": 0.2-0.7,
  "max_tokens": 256-8192,
  "response_format": {"type": "json_object"}
}
```

## 图片模型 Agnes-Image-2.0-Flash

### 验证结果

- **返回格式**: ✅ `url` (Agnes CDN) + `b64_json`
- **aspect_ratio**: ✅ `9:16` 正常
- **num_outputs**: ✅ 1-4 正常
- **negative_prompt**: ✅ 支持
- **size 参数**: ❌ 不支持，返回 500
- **style 参数**: ❌ 不支持，返回 400 错误
- **response_format 参数**: ❌ 不支持 `b64_json` 模式，返回 400
- **reference_images**: ⚠️ 字段名存在但未实测
- **实际测试**: 3 个角色图 + 8 个分镜图全部真实生成成功

### 请求格式

```json
POST /v1/images/generations
{
  "model": "agnes-image-2.0-flash",
  "prompt": "...",
  "aspect_ratio": "9:16",
  "num_outputs": 4,
  "negative_prompt": "ugly, deformed, low quality, blurry"
}
```

### 已知限制

- **不支持**: `size`, `style`, `response_format` 参数（已在 Adapter 中移除）
- **图片 URL**: 外部 CDN，建议下载到本地存储

## 视频模型 Agnes-Video-V2.0

### 验证结果

- **创建任务**: ✅ 返回 `task_id`, `status: "queued"`
- **text-to-video**: ✅ 支持（task 创建成功）
- **image-to-video (URL)**: ✅ 支持（task 创建成功）
- **image-to-video (base64)**: ⚠️ 待验证
- **轮询**: ✅ `GET /v1/videos/{task_id}` 正常返回 status
- **视频生成完成**: ✅ 已验证（历史 task 已 completed）
- **视频下载**: ✅ GCS URL 可直接下载，ffprobe 验证通过

### 关键发现 (2026-06-10)

1. **video_url 字段名**: 完成响应中的视频 URL 位于 `remixed_from_video_id` 字段（不是 `video_url`、`url` 或 `output_url`）。已修复 Adapter 的字段提取逻辑。
2. **队列延迟**: task 在非高峰期约 2 分钟处理时间（`started_at` → `completed_at`），但可能长时间排队。2026-06-09 创建的 task 在 2026-06-10 才完成。
3. **视频参数**: 实际生成 1280×768、h264、aac、24fps、5.04s、~1.3MB。`aspect_ratio: "9:16"` 的实际输出分辨率待进一步验证。
4. **异步模式**: 推荐使用 create + poll 模式，不要同步等待。Adapter 已重构为支持 `createVideoTask()` + `pollVideoTask()` + `waitForVideoCompletion()`。

### 已有 task 轮询结果

```
task_id:        task_dYE3zwrOUiLEQjqyrPpaqfae945VkUKS
是否 completed:  YES ✅
最终 status:     completed
video_url:       https://storage.googleapis.com/agnes-aigc/aigc/videos/2026/06/10/video_de8f4a7bc271facf9c96c890523e2069977e2ab47c9e7a3d.mp4
video_params:    1280×768, h264+aac, 5.04s, 24fps, 1.3MB
等待总时长:      下次轮询时立即获取（task 在前一日已排到）
```

### 三种视频请求测试结果

| Case | 类型 | task_id | 创建状态 | 最终状态 | video_url | 备注 |
|------|------|---------|----------|----------|-----------|------|
| A | t2v | task_gM9mkgkSnpo3vxpLkmJ93SPKOhWsJIGL | ✅ | ⏳ 排队中 | - | 纯文生视频 |
| B | i2v-url | task_fEEbLKIiCGOQApIAmjglfuQ0WvsBMsBh | ✅ | ⏳ 排队中 | - | 传图片URL |
| C | i2v-b64 | 见 probe 脚本输出 | - | - | - | data: URI 格式 |

### 请求格式（创建）

```json
POST /v1/videos
{
  "model": "agnes-video-v2.0",
  "prompt": "...",
  "image": "https://...",        // 可选，图生视频时传入
  "duration": 5,
  "aspect_ratio": "9:16"
}
```

### 轮询格式

```json
GET /v1/videos/{task_id}
// 进行中: {"status": "queued|processing", "progress": 0-100}
// 完成:   {"status": "completed", "progress": 100, "remixed_from_video_id": "https://..."}
// 失败:   {"status": "failed", "error": "..."}
```

### 完成响应关键字段

```json
{
  "status": "completed",
  "progress": 100,
  "remixed_from_video_id": "https://storage.googleapis.com/...",
  "seconds": "5.0",
  "size": "1280x768",
  "video_id": "video_...",
  "completed_at": 1781025077
}
```

### 已知限制

- **队列拥堵**: task 创建后可能在队列中等待较长时间（数小时到一天）
- **分辨率**: 当前返回 `1280x768`，`aspect_ratio: "9:16"` 的实际效果需确认
- **base64 传图**: 图片 API 不支持 `response_format: b64_json` 模式，需从 URL 下载后手动转换
- **建议**: 使用异步模式（创建→保存 task_id→轮询→下载），不要同步等待

## 真实闭环测试详细结果

### 项目信息

```
project_id:              758478ba-2a80-4033-ab88-83948c4eb113
story_package_id:        0186b8ba-085d-44ad-8f77-318f86d27df5
character_count:         3
real_character_image_url: https://platform-outputs.agnes-ai.space/images/text-to-image/2026/06/...
episode_id:              d4040f5a-7a12-43e2-aa9f-afb358a503a4
shot_count:              8
real_shot_image_url:     https://platform-outputs.agnes-ai.space/images/text-to-image/2026/06/...
video_task_id:           task_dYE3zwrOUiLEQjqyrPpaqfae945VkUKS
video_poll_completed:    YES ✅ (2026-06-10)
video_url:               https://storage.googleapis.com/agnes-aigc/aigc/videos/2026/06/10/...
```

### 各阶段结果

| 步骤 | 模型 | 结果 | 耗时 |
|------|------|------|------|
| 1. 创建项目 | - | ✅ | <1s |
| 2. 故事方案 | Agnes Text | ✅ | ~3s |
| 3. 确认故事 | - | ✅ | <1s |
| 4. 角色设定 | Agnes Text | ✅ | ~5s |
| 5. 确认角色 | - | ✅ | <1s |
| 6. 角色图(1张) | Agnes Image | ✅ | ~3s |
| 6b. 角色图(批量) | Agnes Image | ✅ (12张) | ~30s |
| 7. 确认角色图 | - | ✅ | <1s |
| 8. 分镜脚本 | Agnes Text | ✅ (8 shots) | ~8s |
| 9. 确认分镜 | - | ✅ | <1s |
| 10. 分镜图 | Agnes Image | ✅ (32张) | ~60s |
| 11. 确认分镜图 | - | ✅ | <1s |
| 12. 视频创建 | Agnes Video | ✅ | <1s |
| 13. 视频轮询 | Agnes Video | ✅ (次日完成) | ~1天排队 |
| 14. 视频下载 | - | ✅ | ~11s |
| 15. ffprobe 验证 | - | ✅ | <1s |

## 当前结论

| 指标 | 状态 |
|------|------|
| 真实文本 API | ✅ 已接通，故事/角色/分镜均通过 |
| 真实图片 API | ✅ 已接通，角色图+分镜图均生成 |
| 真实视频 API | ✅ 已接通并验证完成（task 创建→轮询→completed→下载→ffprobe） |
| 视频队列延迟 | ⚠️ 非高峰期 ~2 分钟处理，高峰期可能数小时排队 |
| 视频 URL 字段 | ✅ 已确认：`remixed_from_video_id` |
| Mock 全流程 | ✅ 一键通过 (`npm run test:e2e`) |
| 最小真实闭环 | ✅ 文本+图片+视频全部验证通过 |

## 待继续验证

1. 视频模型在高峰期的实际排队时间
2. `aspect_ratio: "9:16"` 是否输出真正的竖屏分辨率（当前返回 1280×768）
3. `image` 参数对 i2v 的输出质量影响
4. 视频输出质量（分辨率、时长、动态效果）
5. 图片 `reference_images` 字段用于角色一致性
