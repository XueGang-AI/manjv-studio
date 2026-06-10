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
| **Phase 11** | 任务队列 | BullMQ + SSE + 重试/取消 |
| **Phase 12** | 版本管理 | createVersion + rollback + diff |
| **Phase 13** | 质量检查 | 6 维度 QC + 评分 + 建议 |

## 技术栈

- Next.js 16 + TypeScript + TailwindCSS
- Prisma 7 + PostgreSQL 16
- BullMQ + Redis 7
- FFmpeg 8.1 (视频合成)
- vitest (单元测试)

## 数据规模

- 21 张数据库表
- 25 个 Prompt 模板
- 23 个素材库 JSON
- 18 个单元测试
- 20 步 E2E Mock 测试流程
- 10 步真实 API 原型测试流程

## Mock 模式 vs 真实 API

| 模式 | 文本模型 | 图片模型 | 视频模型 | 全流程 |
|------|----------|----------|----------|--------|
| **Mock** | ✅ 可跑通 | ✅ 可跑通 | ✅ 可跑通 | ✅ `npm run test:e2e` 20/20 |
| **真实 API** | ✅ 已接通 | ✅ 已接通 | ✅ 已接通并验证 | ✅ 30s 原型 MP4 已生成 |

### 真实 API 验证详情

- **文本** (Agnes-2.0-Flash): 故事方案、角色设定、分镜脚本均真实生成成功
- **图片** (Agnes-Image-2.0-Flash): 角色图 (12张) + 分镜图 (24张) 均真实生成成功
- **视频** (Agnes-Video-V2.0): task 创建→轮询→completed→下载→FFmpeg 合成全部验证通过
- **最终产物**: 1080×1920, H.264+AAC, 30.26s, 25fps, 5.96MB MP4
- **已知限制**: 视频队列可能延迟 10-30 分钟；输出分辨率 1280×768 需 FFmpeg 后处理至 1080×1920

## 验收脚本

```bash
npm test                           # 18 unit tests
npm run test:e2e                   # Mock 全流程 20 步
npm run test:e2e:real              # 真实 API 最小闭环
npx tsx scripts/e2e-real-15s-prototype.ts  # 30s 短视频原型
npm run probe:agnes:text           # 文本探针
npm run probe:agnes:image          # 图片探针
npm run probe:agnes:video          # 视频探针
npm run probe:agnes:video:poll     # 轮询已有视频 task
```
