# 真实 Agnes API 探针报告

## 基础配置

| 项目 | 值 |
|------|-----|
| base_url | `https://apihub.agnes-ai.com/v1` |
| text_model | `agnes-2.0-flash` |
| image_model | `agnes-image-2.0-flash` |
| video_model | `agnes-video-v2.0` |
| auth_header | `Authorization: Bearer <API_KEY>` |

## 文本模型 Agnes-2.0-Flash

### 探针结果

- **端点**: `POST /v1/chat/completions`
- **状态码**: 200 ✅
- **JSON 输出**: ✅ 严格输出 JSON，无 markdown
- **中文支持**: ✅ 正常
- **System Prompt**: ✅ 支持
- **response_format**: ✅ 支持 `{type: "json_object"}`

### 请求示例

```json
{
  "model": "agnes-2.0-flash",
  "messages": [
    {"role": "system", "content": "你是一个严格输出 JSON 的助手。"},
    {"role": "user", "content": "请返回 {\"ok\": true}"}
  ],
  "temperature": 0.2,
  "max_tokens": 256
}
```

### 响应格式

```json
{
  "choices": [{"message": {"content": "{\"ok\": true}"}}],
  "usage": {"prompt_tokens": 50, "completion_tokens": 10}
}
```

## 图片模型 Agnes-Image-2.0-Flash

### 探针结果

- **端点**: `POST /v1/images/generations`
- **状态码**: 200 ✅
- **返回格式**: `url` + `b64_json`
- **size 参数**: ❌ 使用 `size` 返回 500，需用 `aspect_ratio`
- **num_outputs**: ✅ 支持
- **negative_prompt**: ✅ 支持
- **seed**: ✅ 待确认
- **reference_images**: ✅ 待确认（字段名 `reference_images`）

### 请求示例

```json
{
  "model": "agnes-image-2.0-flash",
  "prompt": "Korean manhwa style, beautiful Chinese woman portrait, elegant",
  "aspect_ratio": "9:16",
  "num_outputs": 1
}
```

### 响应格式

```json
{
  "data": [{
    "url": "https://platform-outputs.agnes-ai.space/images/...",
    "b64_json": "...",
    "revised_prompt": "..."
  }]
}
```

### 已知限制

- 不支持 `size` 参数（如 `1080x1920`），需使用 `aspect_ratio`
- 图片 URL 为外部 CDN，可能需要下载到本地存储避免外链失效

## 视频模型 Agnes-Video-V2.0

### 探针结果

- **端点**: `POST /v1/videos`
- **状态码**: 200 ✅
- **异步模式**: ✅ 返回 `task_id`，需轮询
- **轮询端点**: `GET /v1/videos/{task_id}`
- **status 字段**: `processing` → `completed` / `failed`
- **progress**: ✅ 0-100
- **text-to-video**: ✅ 支持
- **image-to-video**: ✅ 支持（`image` 字段）

### 请求示例

```json
{
  "model": "agnes-video-v2.0",
  "prompt": "A young woman standing in rainy street, slow push-in camera, cinematic lighting",
  "duration": 5,
  "aspect_ratio": "9:16"
}
```

### 响应格式（创建）

```json
{
  "id": "task_xxx",
  "task_id": "task_xxx",
  "status": "processing",
  "progress": 0,
  "seconds": 5
}
```

### 响应格式（轮询完成）

```json
{
  "status": "completed",
  "video_url": "https://...",
  "seconds": 5
}
```

### 轮询策略

- 间隔: 5 秒
- 最大等待: 10 分钟 (120 次)
- 状态: processing → completed / failed

## 真实全流程状态

| 阶段 | 状态 | 说明 |
|------|------|------|
| 文本模型 | ✅ 真实可用 | 故事/角色/分镜全部真实生成 |
| 图片模型 | ✅ 真实可用 | 探针通过，Adapter 已更新 |
| 视频模型 | ✅ 真实可用 | 探针通过，异步 task_id + 轮询 |
| 全流程 | ⚠️ 待验证 | 需真实 API 完整端到端测试（需等待视频生成时间） |

## 待验证项

1. 图片 `reference_images` 字段——用于角色一致性
2. 视频 `image` 字段（图生视频）
3. 图片 API 的 `seed` 固定能力
4. 视频最长 duration 范围
5. API 并发限制和 QPS
