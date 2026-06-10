# Agnes Video V2.0 音频与口型同步探针报告

> 测试时间: 2026-06-10
> 模型: agnes-video-v2.0
> API Base: https://apihub.agnes-ai.com/v1
> 方法: 仅创建 task（POST /v1/videos），不等待 completed

## 测试结果

| Case | 字段 | HTTP | task_id | 结论 |
|------|------|------|---------|------|
| 01_baseline | `-` (标准 i2v) | 200 | task_GNxMXrWoX7zcc9nd... | 基线通过 |
| 02_dialogue | `dialogue` | 200 | task_SBBRKAxpV78wldm... | ✅ 创建任务阶段接受 |
| 03_voice_text | `voice_text` | 200 | task_TgcvfnbCtv8nEKL... | ✅ 创建任务阶段接受 |
| 04_audio_url | `audio_url` | 200 | task_8iIxbbBEJzUKK28... | ✅ 创建任务阶段接受 |
| 05_voice_id | `voice_id` | 200 | task_0uyxgxZOJmZegmAQ... | ✅ 创建任务阶段接受 |
| 06_lip_sync | `lip_sync` + `audio_url` | 200 | task_yzvm7Ev11eKJbagl... | ✅ 创建任务阶段接受 |
| 07_generate_audio | `generate_audio` | 200 | task_58dGC9FFuZe9F8U... | ✅ 创建任务阶段接受 |

**全部 7/7 字段被 API 接受（HTTP 200 + 返回 task_id）。**

## 各 Case 请求体

### 01_baseline（基线）

```json
{
  "model": "agnes-video-v2.0",
  "prompt": "A young Chinese woman speaking gently, Korean manhwa style, slow push-in camera, cinematic lighting, high quality, no watermark",
  "duration": 5,
  "aspect_ratio": "9:16",
  "image": "https://platform-outputs.agnes-ai.space/images/.../xxx.png"
}
```

### 02_dialogue（对话文本）

```json
{
  ...基线,
  "dialogue": "你好，今天天气真不错，我们去散步吧。"
}
```

### 03_voice_text（语音文本）

```json
{
  ...基线,
  "voice_text": "你好，今天天气真不错，我们去散步吧。"
}
```

### 04_audio_url（音频 URL）

```json
{
  ...基线,
  "audio_url": "https://www.w3schools.com/html/horse.mp3"
}
```

### 05_voice_id（音色 ID）

```json
{
  ...基线,
  "voice_id": "zh_female_gentle_01"
}
```

### 06_lip_sync（口型同步标记）

```json
{
  ...基线,
  "audio_url": "https://www.w3schools.com/html/horse.mp3",
  "lip_sync": true
}
```

### 07_generate_audio（自动生成音频）

```json
{
  ...基线,
  "generate_audio": true
}
```

## 响应格式

所有 200 响应均返回相同结构：

```json
{
  "id": "task_...",
  "video_id": "video_...",
  "task_id": "task_...",
  "object": "video",
  "model": "agnes-video-v2.0",
  "status": "queued",
  "progress": 0,
  "created_at": 1781...,
  "seconds": "5.0",
  "size": "1280x768"
}
```

**注意**: 响应中无音频相关字段（无 `audio_url`、`has_audio`、`lip_sync_status` 等），无法从创建响应判断音频是否生效。

## 分析

### 接受的字段

| 字段 | 推测用途 | 验证状态 |
|------|----------|----------|
| `dialogue` | 指定角色对白文本 | ⚠️ 仅创建阶段接受 |
| `voice_text` | TTS 文本输入 | ⚠️ 仅创建阶段接受 |
| `audio_url` | 外部音频文件 URL | ⚠️ 仅创建阶段接受 |
| `voice_id` | 预设音色 ID | ⚠️ 仅创建阶段接受 |
| `lip_sync` | 是否启用口型同步 | ⚠️ 仅创建阶段接受 |
| `generate_audio` | 是否自动生成音频 | ⚠️ 仅创建阶段接受 |

## 结论

> ⚠️ **重要声明**
>
> 本探针仅验证 API 在**创建任务阶段**是否接受参数（HTTP 200 + 返回 task_id）。
>
> **不代表**音频实际生成成功、口型同步有效、或 completed 视频包含音频轨。
>
> 完整验证需要：
> 1. 等待 task completed
> 2. 下载视频
> 3. ffprobe 检测音频轨
> 4. 人工观看确认口型/对白同步

### 当前状态

```
API 接受 7/7 音频/口型字段 ✅
实际音频生成效果 未验证 ❓
口型同步效果       未验证 ❓
```

### 建议

1. 选一个带 `dialogue` 或 `voice_text` 的 task 等待 completed，下载后用 ffprobe 检查音频轨
2. 如果确认有效，可在 AgnesVideoAdapter 中增加 `dialogue`/`voice_text`/`generate_audio` 参数透传
3. 当前业务主流程不集成音频字段，仅留作后续迭代参考
