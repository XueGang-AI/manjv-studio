# Ark-only 一致性自动化漫剧需求与验收基线

本文档记录当前生产目标、MVP 范围和逐步验收标准。旧阶段性草案已归档为实现结果，不再作为待办计划维护。

## 当前基线

- 真实生产链路固定使用 Ark/豆包模型，Mock 仅用于开发和测试。
- 8 步主流程已接入 Worker 任务系统：故事方案、角色设定、角色图、分镜脚本、场景参考图、分镜图、视频片段、最终成片。
- 分镜图生成会传入匹配角色参考图和当前场景参考图。
- 视频生成使用 Seedance 2.0，输入当前确认分镜图，并继承角色/场景参考包。
- 场景资产层使用 `Scene` / `SceneImage`，分镜镜头通过 `Shot.sceneId` 绑定场景。
- 规则 QC、自动确认、发布包 manifest 已具备最小闭环。

## 最终目标

```text
用户输入项目设定
→ 自动生成故事方案
→ 自动生成角色设定
→ 自动生成多角度角色参考图
→ 自动生成分镜脚本并绑定场景
→ 自动生成场景参考图
→ 自动生成带角色/场景参考的分镜图
→ 自动生成带角色/场景参考的视频片段
→ 自动 QC / 自动确认
→ FFmpeg 合成最终 MP4
→ 输出发布包
```

## MVP 范围

MVP 必须稳定满足以下能力：

1. 新项目固定写入 `modelProvider = ark`，前端不提供真实 Provider 选择。
2. `USE_MOCK_MODEL=true` 只允许在非生产环境使用。
3. 所有 AI 调用通过 `adapterFactory`，不得绕过适配层。
4. 所有 Prompt 从 `prompt_templates` 表渲染，模板源文件在 `prompts/`。
5. Worker 负责所有耗时生成任务，API Route 只创建任务并返回 `taskId`。
6. 分镜图与视频生成必须真实传入角色参考图和场景参考图。
7. 最终成片只使用 FFmpeg 两阶段规范化链路，不在成片阶段修复一致性问题。

## 自动化流程

| 步骤 | 输入 | Prompt / 模型 | 输出 | 验收点 |
|------|------|---------------|------|--------|
| 创建项目 | 项目名、题材、平台、比例、集数 | 无 | `Project` | `modelProvider=ark` |
| 故事方案 | 项目设定 | 故事模板 + Ark 文本模型 | `StoryPackage` | Worker 任务 `GENERATE_STORY_PACKAGE` 成功 |
| 角色设定 | 已确认故事方案 | 角色模板 + Ark 文本模型 | `Character[]` | 角色可确认、版本快照可追溯 |
| 角色图 | 已确认角色 | 角色图模板 + Ark 图片模型 | `CharacterImage[]` | 主角多角度参考图齐全 |
| 分镜脚本 | 已确认角色图 | 分镜模板 + Ark 文本模型 | `Episode` / `Shot[]` / `Scene[]` | 镜头时长已 snap，镜头绑定场景 |
| 场景参考图 | `Scene[]` | 场景图模板 + Ark 图片模型 | `SceneImage[]` | 每个场景至少 1 张可用参考图 |
| 分镜图 | `Shot` + 角色参考 + 场景参考 | 分镜图模板 + Ark 图片模型 | `ShotImage[]` | 请求参数含 `referenceImages` |
| 视频片段 | 确认分镜图 + 角色参考 + 场景参考 | 视频模板 + Seedance 2.0 | `ShotVideo[]` | `remoteTaskId` 幂等持久化 |
| 自动 QC | 当前阶段产物 | `qcService` 规则 QC | `QcReport` | 达阈值后自动确认当前阶段 |
| 最终成片 | 已确认视频片段 | FFmpeg | `FinalVideo` | 1080x1920 / H.264 / AAC |
| 发布包 | 成片 + 元数据 | 无 | manifest JSON | `FinalVideo.assetPackageUrl` 写回 |

## 参考图策略

角色参考图建议：

| 角色级别 | 建议数量 | 参考类型 |
|----------|----------|----------|
| 主角 | 5 张 | `front_full_body`、`front_half_body`、`left_side`、`right_side`、`back_view` |
| 重要配角 | 3 张 | 正面全身、正面半身、侧身 |
| 普通角色 | 1 张 | 正面半身或全身 |

场景参考图建议：

| 场景级别 | 建议数量 | 用途 |
|----------|----------|------|
| 高频主场景 | 2-3 张 | 稳定空间布局、灯光、色调 |
| 普通场景 | 1-2 张 | 稳定地点和时间基调 |
| 一次性过场 | 1 张 | 降低生成漂移 |

## 一致性验收

人物一致性：

- 同一角色跨镜头的脸型、发型、服装主色保持稳定。
- 多人镜头不明显串脸。
- 分镜图和视频生成请求均包含匹配角色的 `referenceImages`。

场景一致性：

- 同一地点复用同一组 `SceneImage`。
- 镜头 Prompt 保留场景文字描述，同时传入场景参考图。
- 视频片段继承分镜图阶段使用的角色/场景参考包。

工程一致性：

- Worker 原子领取、崩溃恢复、retryCount 语义不变。
- Redis Pub/Sub 断线后自动重连并重订阅。
- `SHOT_VIDEOS` 远端任务通过 `remoteTaskId` 防重复提交。
- 所有 API 返回 `{success:true,data}` 或 `{success:false,error}`。

## 验收命令

```bash
npx tsc --noEmit
npm test
npm run lint
npm run test:e2e
```

真实 API 最小闭环在具备 Ark 配置后执行：

```bash
npm run test:e2e:real
```
