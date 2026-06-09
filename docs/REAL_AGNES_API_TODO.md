# 真实 Agnes API 接入 TODO

## 当前状态

Mock 模式 (`USE_MOCK_MODEL=true`) 已完整跑通整个生产流程。

## 文本模型 Agnes-2.0-Flash

| 项目 | 状态 |
|------|------|
| AGNES_TEXT_API_BASE_URL | ❌ 未配置 |
| AGNES_TEXT_API_KEY | ✅ 已配置 (`sk-KLp2s...`) |
| 请求格式 | ✅ 代码假设 OpenAI Chat Completions 兼容 |
| JSON 输出支持 | ✅ 代码中使用 `response_format: {type: "json_object"}` |
| 真实调用 | ❌ 未接通（缺少 base URL） |
| 待确认 | API endpoint 是否为 `/chat/completions` 路径 |

## 图片模型 Agnes-Image-2.0-Flash

| 项目 | 状态 |
|------|------|
| AGNES_IMAGE_API_BASE_URL | ❌ 未配置 |
| AGNES_IMAGE_API_KEY | ❌ 需要单独的图片 API key？ |
| reference_images 支持 | ❓ 待确认如何传递（URL？base64？multipart？） |
| negative_prompt 支持 | ❓ 待确认 |
| num_outputs 支持 | ❓ 待确认范围 |
| seed 支持 | ❓ 待确认 |
| 返回格式 | ❓ URL 还是 base64 |
| 同步/异步 | ❓ 同步返回还是需要 poll |
| 真实调用 | ❌ 未接通 |

## 视频模型 Agnes-Video-2.0

| 项目 | 状态 |
|------|------|
| AGNES_VIDEO_API_BASE_URL | ❌ 未配置 |
| AGNES_VIDEO_API_KEY | ❌ 需要单独的视频 API key？ |
| image_to_video 支持 | ❓ 待确认 |
| input_image 传递方式 | ❓ URL？base64？ |
| duration 支持范围 | ❓ 2-8s？更广？ |
| 返回格式 | ❓ 视频 URL 还是任务 ID |
| 同步/异步 | ❓ 大概率异步（生成耗时长） |
| poll 机制 | ❓ 需要确认 poll endpoint 和间隔 |
| 真实调用 | ❌ 未接通 |

## 接真实 API 后重点测试

1. 文本模型 JSON 输出稳定性（是否严格输出 JSON）
2. 图片模型角色一致性（同一角色的多张候选图是否相似）
3. 视频模型动态自然度（人物脸部是否变形）
4. API 超时和重试策略
5. 并发限制（图片/视频 API 是否有 QPS 限制）
6. 成本控制（每张图/每段视频的 token 消耗）
