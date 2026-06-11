# API 文档

Base URL: `http://localhost:3000/api`

## 项目 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 获取项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/:id` | 获取项目详情 |
| PATCH | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |

### 创建项目 (POST)

```json
{
  "project_name": "雨夜重生",
  "story_type": "现代",
  "background": "现代都市，珠宝设计",
  "main_characters": ["林若雪", "顾辰"],
  "core_conflict": "爱情与复仇",
  "story_summary": "...至少20字",
  "art_style": "韩漫",
  "target_platform": "抖音",
  "episode_count": 10,
  "episode_duration": 90,
  "aspect_ratio": "9:16",
  "model_provider": "agnes"
}
```

## 故事方案 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/story/generate` | 生成故事方案 |
| GET | `/api/projects/:id/story` | 获取所有版本 |
| PATCH | `/api/projects/:id/story/:spId` | 更新内容 |
| POST | `/api/projects/:id/story/:spId/confirm` | 确认方案 |

## 角色 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/characters/generate` | 生成角色卡 |
| GET | `/api/projects/:id/characters` | 获取角色列表 |
| PATCH | `/api/projects/:id/characters/:cId` | 更新角色 |
| POST | `/api/projects/:id/characters/:cId/confirm` | 确认角色 |

## 角色图 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/character-images/generate` | 生成候选图 |
| GET | `/api/projects/:id/character-images` | 获取角色图 |
| POST | `/api/projects/:id/character-images/:iId/select` | 选择标准图 |
| POST | `/api/projects/:id/character-images/:iId/confirm` | 确认标准图 |
| POST | `/api/projects/:id/characters/:cId/images/regenerate` | 重新生成 |
| POST | `/api/projects/:id/character-images/batch-confirm` | 批量确认角色图 |

## 分镜 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/storyboard/generate` | 生成分镜 |
| GET | `/api/projects/:id/episodes/:eId/storyboard` | 获取分镜 |
| PATCH | `/api/projects/:id/episodes/:eId/storyboard` | 更新剧集 |
| POST | `/api/projects/:id/episodes/:eId/storyboard/confirm` | 确认分镜 |
| POST | `/api/projects/:id/episodes/:eId/shots` | 新增镜头 |
| PATCH | `/api/projects/:id/episodes/:eId/shots/:sId` | 更新镜头 |
| DELETE | `/api/projects/:id/episodes/:eId/shots/:sId` | 删除镜头 |

## 分镜图 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/episodes/:eId/shot-images/generate` | 生成分镜图 |
| GET | `/api/projects/:id/episodes/:eId/shot-images` | 获取分镜图 |
| POST | `/api/projects/:id/episodes/:eId/shot-images/:iId/select` | 选择 |
| POST | `/api/projects/:id/episodes/:eId/shot-images/:iId/confirm` | 确认 |
| POST | `/api/projects/:id/episodes/:eId/shots/:sId/images/regenerate` | 重新生成 |
| POST | `/api/projects/:id/episodes/:eId/shot-images/batch-confirm` | 批量确认分镜图 |

## 视频 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/episodes/:eId/shot-videos/generate` | 生成视频片段 |
| GET | `/api/projects/:id/episodes/:eId/shot-videos` | 获取视频片段 |
| POST | `/api/projects/:id/episodes/:eId/shot-videos/:vId/select` | 选择 |
| POST | `/api/projects/:id/episodes/:eId/shot-videos/:vId/confirm` | 确认 |
| POST | `/api/projects/:id/episodes/:eId/shots/:sId/videos/regenerate` | 重新生成 |

## 成片渲染 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/episodes/:eId/final-preview/render` | 合成最终视频 |
| GET | `/api/projects/:id/episodes/:eId/final-preview` | 获取状态 |

## 任务 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks` | 所有任务 |
| GET | `/api/tasks/:id` | 任务详情 |
| GET | `/api/tasks/:id/logs` | 任务日志 |
| POST | `/api/tasks/:id/retry` | 重试 |
| POST | `/api/tasks/:id/cancel` | 取消 |
| GET | `/api/projects/:id/tasks` | 项目任务 |
| GET | `/api/projects/:id/tasks/stream` | SSE 实时推送 |

## 版本 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects/:id/versions` | 版本列表(?entity_type=) |
| GET | `/api/projects/:id/versions/:vId` | 版本详情 |
| POST | `/api/projects/:id/versions/:vId/rollback` | 回退 |
| POST | `/api/projects/:id/versions/:vId/set-current` | 设为当前 |
| GET | `/api/projects/:id/versions/compare` | 对比(?from=&to=) |

## QC API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/qc/run` | 运行项目 QC |
| GET | `/api/projects/:id/qc/reports` | 查看报告 |
| GET | `/api/projects/:id/qc/reports/:rId` | 报告详情 |
| POST | `/api/projects/:id/episodes/:eId/qc/run` | 运行剧集 QC |
| GET | `/api/projects/:id/episodes/:eId/qc/reports` | 剧集报告 |

## 视频任务检查（异步轮询）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/episodes/:eId/shot-videos/:vId/check-task` | 手动检查远端视频任务状态 |

调用后自动轮询 Agnes Video API，更新 `remote_status`/`remote_progress`/`videoUrl` 字段。

## 返回格式

成功: `{"success":true,"data":{}}`
失败: `{"success":false,"error":"错误信息"}`
