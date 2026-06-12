# Phase 1-13 开发总结

## 已完成的 13 个 Phase

| Phase | 内容 | 关键产物 |
|-------|------|----------|
| **Phase 1** | 项目初始化 | Next.js + Prisma + 基础布局 |
| **Phase 2** | Prompt 模板库 | 25 个 .prompt + 23 个 .json 素材库 |
| **Phase 3** | 项目创建 | CRUD + 表单校验 |
| **Phase 4** | 故事方案 | AI 分析 + JSON Schema 校验 |
| **Phase 5** | 角色设定卡 | 3 角色外表/性格/Prompt |
| **Phase 6** | 角色图 | 每角色 4 张候选 + 标准图确认 |
| **Phase 7** | 分镜脚本 | 6 镜头 + image_prompt + video_prompt |
| **Phase 8** | 分镜图 | 6×4 候选图 + reference |
| **Phase 9** | 视频片段 | 6×2 视频 + 图生视频 |
| **Phase 10** | 成片合成 | FFmpeg 拼接 → 1080×1920 MP4 |
| **Phase 11** | 任务管理 | Prisma 任务记录 + SSE 推送 + 批量轮询 |
| **Phase 12** | 版本管理 | createVersion + rollback + diff |
| **Phase 13** | 质量检查 | 6 维度 QC + 评分 + 建议 |

## 技术栈

- Next.js 16 + TypeScript + TailwindCSS
- Prisma 7 + PostgreSQL 16
- FFmpeg 8.1（视频合成）
- vitest（单元测试）
- Agnes AI: Agnes-2.0-Flash / Agnes-Image-2.0-Flash / Agnes-Video-V2.0
- Ark (火山引擎/豆包): doubao-seed-character-251128 / doubao-seedream-5-0-260128 / doubao-seedance-1-5-pro-251215

## 数据规模

- 21 张数据库表
- 25 个 Prompt 模板
- 23 个素材库 JSON
- 18 个单元测试
- 20 步 E2E Mock 测试流程
- 10 步真实 API 原型测试流程

## 双模式支持

| 模式 | 文本模型 | 图片模型 | 视频模型 | 全流程 |
|------|----------|----------|----------|--------|
| **免费 (Agnes)** | ✅ Agnes-2.0-Flash | ✅ Agnes-Image-2.0-Flash | ✅ Agnes-Video-V2.0 | ✅ `npm run test:e2e` 20/20 |
| **付费 (豆包)** | ✅ doubao-seed-character | ✅ doubao-seedream-5-0-260128 | ✅ doubao-seedance-1-5-pro | ✅ 异步任务模式验证通过 |

### 视频生成链路

- **Agnes 模式**: num_frames(≤441, 8n+1) + frame_rate 控制时长，最长 ≈18s/24fps；推荐轮询端点 `/agnesapi?video_id=<VIDEO_ID>`
- **Ark 模式**: i2v 支持 4~12 秒，t2v 支持 5/10 秒；分镜生成时自动拆分超长镜头
- **异步轮询**: 前端 10s 间隔调用 `/batch-check-tasks`，真正查询远程 API（非仅读 DB）
- **成片合成**: FFmpeg 支持远程 URL 拼接

## 验收脚本

```bash
npm test                           # 18 unit tests
npm run test:e2e                   # Mock 全流程 20 步
npm run test:e2e:real              # 真实 API 最小闭环
npx tsx scripts/e2e-real-15s-prototype.ts  # 30s 短视频原型
npm run probe:agnes:text           # Agnes 文本探针
npm run probe:agnes:image          # Agnes 图片探针
npm run probe:agnes:video          # Agnes 视频探针（创建+短轮询）
npm run probe:agnes:video:poll     # 轮询已有 task（需 --task-id <id>）
npm run probe:ark:text             # Ark 文本探针
npm run probe:ark:image            # Ark 图片探针
npm run probe:ark:video            # Ark 视频探针
```
