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

- **不支持**: `size`, `style` 参数（已在 Adapter 中移除）
- **图片 URL**: 外部 CDN，建议下载到本地存储

## 视频模型 Agnes-Video-V2.0

### 验证结果

- **创建任务**: ✅ 返回 `task_id`, `status: "queued"`
- **text-to-video**: ✅ 支持
- **image-to-video**: ⚠️ 创建成功但一直排队
- **轮询**: ✅ `GET /v1/videos/{task_id}` 正常返回 status
- **实际测试**: task 创建成功，但 10 分钟内 status 一直为 `queued`

### 请求格式（创建）

```json
POST /v1/videos
{
  "model": "agnes-video-v2.0",
  "prompt": "...",
  "image": "https://platform-outputs.../confirmed-shot.png",
  "duration": 5,
  "aspect_ratio": "9:16"
}
```

### 轮询格式

```json
GET /v1/videos/{task_id}
// Response: {"status": "queued|processing|completed|failed", "progress": 0-100}
```

### 已知限制

- **队列拥堵**: task 创建后可能在队列中等待超过 10 分钟
- **progress 字段**: 探针返回中未包含 progress 数值（显示 `?%`）
- **建议**: 增加最大等待时间至 30 分钟，或使用 webhook 回调

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
video_poll_status:       queued (120 polls, 10 min timeout)
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
| 13. 视频轮询 | Agnes Video | ❌ 超时 | 600s |

## 当前结论

| 指标 | 状态 |
|------|------|
| 真实文本 API | ✅ 已接通，故事/角色/分镜均通过 |
| 真实图片 API | ✅ 已接通，角色图+分镜图均生成 |
| 真实视频 API | ⚠️ 已接通但队列耗时过长 |
| Mock 全流程 | ✅ 一键通过 (`npm run test:e2e`) |
| 最小真实闭环 | ⚠️ 文本+图片完成，视频需更长等待 |

## 待继续验证

1. 视频模型在非高峰期的实际生成时间和成功率
2. `image` 参数对 i2v 是否生效（当前 task 未处理完无法确认输出质量）
3. 视频输出质量（分辨率、时长、动态效果）
4. 图片 `reference_images` 字段用于角色一致性
