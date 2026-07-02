# API 文档

Base URL: `http://localhost:3100/api`

所有接口统一返回：

```json
{ "success": true, "data": {} }
{ "success": false, "error": "错误信息" }
```

## 异步任务语义

耗时生成接口只创建 `generation_tasks` 记录并返回 `taskId`，实际执行由独立 Worker 完成。前端通过任务列表或 SSE 监听状态：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks` | 全局任务列表 |
| GET | `/api/tasks/:id` | 任务详情 |
| GET | `/api/tasks/:id/logs` | 任务日志 |
| POST | `/api/tasks/:id/retry` | 重试失败任务 |
| POST | `/api/tasks/:id/cancel` | 取消等待中或执行中任务 |
| GET | `/api/projects/:id/tasks` | 项目任务列表 |
| GET | `/api/projects/:id/tasks/stream` | 项目任务 SSE 实时推送 |

生产 Worker 注册任务：`GENERATE_STORY_PACKAGE`、`GENERATE_CHARACTERS`、`GENERATE_CHARACTER_IMAGES`、`GENERATE_STORYBOARD`、`GENERATE_SCENE_REFERENCES`、`GENERATE_SHOT_IMAGES`、`GENERATE_SHOT_VIDEOS`、`RENDER_FINAL_VIDEO`。

## 项目 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 获取项目列表 |
| POST | `/api/projects` | 创建项目，新项目固定 `model_provider=ark` |
| GET | `/api/projects/:id` | 获取项目详情 |
| PATCH | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |

创建项目示例：

```json
{
  "project_name": "雨夜重生",
  "story_type": "现代",
  "background": "现代都市，珠宝设计",
  "main_characters": ["林若雪", "顾辰"],
  "core_conflict": "爱情与复仇",
  "story_summary": "至少20字的故事简介",
  "art_style": "韩漫",
  "target_platform": "抖音",
  "episode_count": 10,
  "episode_duration": 90,
  "aspect_ratio": "9:16"
}
```

## 创作主流程 API

| 阶段 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 故事方案 | POST | `/api/projects/:id/story/generate` | 创建故事方案生成任务 |
| 故事方案 | GET | `/api/projects/:id/story` | 获取所有故事方案版本 |
| 故事方案 | PATCH | `/api/projects/:id/story/:storyPackageId` | 更新故事方案 |
| 故事方案 | POST | `/api/projects/:id/story/:storyPackageId/confirm` | 确认故事方案 |
| 角色设定 | POST | `/api/projects/:id/characters/generate` | 创建角色设定生成任务 |
| 角色设定 | GET | `/api/projects/:id/characters` | 获取角色列表 |
| 角色设定 | PATCH | `/api/projects/:id/characters/:charId` | 更新角色 |
| 角色设定 | POST | `/api/projects/:id/characters/:charId/confirm` | 确认角色 |
| 角色图 | POST | `/api/projects/:id/character-images/generate` | 创建角色图生成任务 |
| 角色图 | GET | `/api/projects/:id/character-images` | 获取角色图 |
| 角色图 | POST | `/api/projects/:id/character-images/:imageId/select` | 选择标准图 |
| 角色图 | POST | `/api/projects/:id/character-images/:imageId/confirm` | 确认标准图 |
| 角色图 | POST | `/api/projects/:id/character-images/:imageId/regenerate` | 按图片重生成 |
| 角色图 | POST | `/api/projects/:id/characters/:charId/images/regenerate` | 按角色重生成 |
| 角色图 | POST | `/api/projects/:id/character-images/batch-confirm` | 批量确认标准角色图 |
| 分镜脚本 | POST | `/api/projects/:id/storyboard/generate` | 创建分镜脚本生成任务 |
| 分镜脚本 | GET | `/api/projects/:id/episodes/:episodeId/storyboard` | 获取分镜 |
| 分镜脚本 | PATCH | `/api/projects/:id/episodes/:episodeId/storyboard` | 更新剧集分镜 |
| 分镜脚本 | POST | `/api/projects/:id/episodes/:episodeId/storyboard/confirm` | 确认分镜 |
| 分镜脚本 | POST | `/api/projects/:id/episodes/:episodeId/shots` | 新增镜头 |
| 分镜脚本 | PATCH | `/api/projects/:id/episodes/:episodeId/shots/:shotId` | 更新镜头 |
| 分镜脚本 | DELETE | `/api/projects/:id/episodes/:episodeId/shots/:shotId` | 删除镜头 |
| 场景参考图 | POST | `/api/projects/:id/episodes/:episodeId/scene-references/generate` | 创建场景参考图生成任务 |
| 场景参考图 | GET | `/api/projects/:id/episodes/:episodeId/scene-references` | 获取场景与参考图 |
| 分镜图 | POST | `/api/projects/:id/episodes/:episodeId/shot-images/generate` | 创建分镜图生成任务 |
| 分镜图 | GET | `/api/projects/:id/episodes/:episodeId/shot-images` | 获取分镜图 |
| 分镜图 | POST | `/api/projects/:id/episodes/:episodeId/shot-images/:imageId/select` | 选择分镜图 |
| 分镜图 | POST | `/api/projects/:id/episodes/:episodeId/shot-images/:imageId/confirm` | 确认分镜图 |
| 分镜图 | POST | `/api/projects/:id/episodes/:episodeId/shots/:shotId/images/regenerate` | 按镜头重生成分镜图 |
| 分镜图 | POST | `/api/projects/:id/episodes/:episodeId/shot-images/batch-confirm` | 批量确认分镜图 |
| 视频片段 | POST | `/api/projects/:id/episodes/:episodeId/shot-videos/generate` | 创建视频片段生成任务 |
| 视频片段 | GET | `/api/projects/:id/episodes/:episodeId/shot-videos` | 获取视频片段 |
| 视频片段 | POST | `/api/projects/:id/episodes/:episodeId/shot-videos/:videoId/select` | 选择视频片段 |
| 视频片段 | POST | `/api/projects/:id/episodes/:episodeId/shot-videos/:videoId/confirm` | 确认视频片段 |
| 视频片段 | POST | `/api/projects/:id/episodes/:episodeId/shots/:shotId/videos/regenerate` | 按镜头重生成视频 |
| 视频片段 | POST | `/api/projects/:id/episodes/:episodeId/shot-videos/:videoId/check-task` | 手动检查单个远端视频任务 |
| 视频片段 | POST | `/api/projects/:id/episodes/:episodeId/shot-videos/batch-check-tasks` | 批量检查远端视频任务 |
| 视频片段 | POST | `/api/projects/:id/episodes/:episodeId/shot-videos/batch-confirm` | 批量确认视频片段 |
| 成片渲染 | POST | `/api/projects/:id/episodes/:episodeId/final-preview/render` | 创建最终视频合成任务 |
| 成片渲染 | GET | `/api/projects/:id/episodes/:episodeId/final-preview` | 获取最终视频状态 |
| 自动化 | POST | `/api/projects/:id/episodes/:episodeId/automation/auto-confirm` | QC 达标后自动确认当前阶段产物 |
| 发布包 | POST | `/api/projects/:id/episodes/:episodeId/release-package/generate` | 生成发布 manifest 并写回成片记录 |

视频远端任务检查会轮询 Ark Video API，并更新 `remoteStatus`、`remoteProgress` 等字段。远端返回 `videoUrl` 后，服务端会先转存到当前媒体存储，再写入 `videoUrl`（read URL）、`storageObjectKey`、`storageProvider` 和 `sourceVideoUrl`；已有 `storageObjectKey` 的记录会在读取时动态刷新 read URL。

### 媒体存储字段

角色图、场景参考图、分镜图、视频片段和最终成片都使用统一媒体存储语义：

| 字段 | 说明 |
|------|------|
| `storageObjectKey` | 正式产物长期对象键，如 `projects/<projectId>/videos/...` 或 `projects/<projectId>/final_videos/...` |
| `storageProvider` | 写入 Provider，默认本地为 `local-fs`；远程显式启用时可能为 `s3-compatible` 或 `aliyun-oss` |
| `sourceUrl` / `sourceVideoUrl` | 脱敏后的供应商来源 URL，仅用于审计，不作为读取入口 |
| `imageUrl` / `videoUrl` | API 当前响应的 read URL；local-fs 为 `/api/media/...`，OSS/S3 场景下通常是短期签名 URL |

`GET /api/projects/:id/episodes/:episodeId/final-preview` 返回的 `latest` 会额外包含 `assetPackageUrl`、`assetPackageObjectKey`、`assetPackageStorageProvider`。发布包生成接口返回 `packageUrl`、`packageObjectKey`、`packageStorageProvider`。

### 单镜头问题驱动重生成

分镜图和视频片段的单镜头重生成接口均支持问题驱动参数：

```json
{
  "issueTypes": [
    "character_drift",
    "hair_inconsistent",
    "scene_drift",
    "phone_fake_ui_text",
    "large_motion_or_hand_deform",
    "audio_issue",
    "other"
  ],
  "fixNote": "保持低马尾和红绳手链，手机屏幕只显示不可读光点",
  "motionStrength": "low",
  "clientRequestId": "uuid"
}
```

返回 `data` 会包含 `candidateId`、`reused`、`appliedFixes`，视频重生成在人物/发型/场景问题下还会返回 `requiresImageRerun=true`。分镜图重生成采用候选追加模式，不删除旧确认图；视频重生成继续保留旧视频候选，并通过 `clientRequestId` 避免重复提交 Ark 远端视频任务。

## 版本 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects/:id/versions` | 版本列表，支持 `?entity_type=` |
| GET | `/api/projects/:id/versions/:versionId` | 版本详情 |
| POST | `/api/projects/:id/versions/:versionId/rollback` | 回滚到版本 |
| POST | `/api/projects/:id/versions/:versionId/set-current` | 设为当前版本 |
| GET | `/api/projects/:id/versions/compare` | 对比版本，`?from=&to=` |

## QC API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/:id/qc/run` | 运行项目 QC |
| GET | `/api/projects/:id/qc/reports` | 查看项目 QC 报告 |
| GET | `/api/projects/:id/qc/reports/:reportId` | QC 报告详情 |
| POST | `/api/projects/:id/episodes/:episodeId/qc/run` | 运行剧集 QC |
| GET | `/api/projects/:id/episodes/:episodeId/qc/reports` | 查看剧集 QC 报告 |

QC issue 输出保留旧字段 `level/field/problem/suggestion`，并补充 `shotNo`、`timeRange`、`issueType`、`severity`（`P0`/`P1`/`P2`/`P3`）和 `recommendedAction`（`accept`、`rerun_shot_image`、`rerun_shot_video`、`rerender_final`）。当前规则会检查角色/场景参考数量、手机屏幕禁用项、成片音轨、响度、黑屏和冻结风险。

## 健康与媒体

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | Web/API 健康检查 |
| GET | `/api/worker/health` | DB、Redis、Worker heartbeat 综合健康检查 |
| GET | `/api/media/:key...` | local-fs 媒体读取代理；默认本地存储模式依赖该路由 |
