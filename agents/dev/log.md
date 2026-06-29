# Dev Log

## 2026-06-28 07:25 Ark 新模型与 api/plan 配置统一

- 门禁：当前角色 `developer`；消息来源为注册表中的 `product_planner` 线程 `019f0b54-4556-70d3-827f-3f95735ce808`；任务类型为开发任务；`registry.json` 中开发 Agent 允许修改业务代码。
- 实现：统一 `DEFAULT_ARK_API_BASE_URL=https://ark.cn-beijing.volces.com/api/plan`，默认模型改为 `doubao-seed-2.0-pro`、`doubao-seedream-5.0-lite`、`doubao-seedance-2.0`；`normalizeArkBaseUrl()` 导出并在运行时、探针脚本、真实 E2E 中把 `/api/plan` 规范化到实际请求前缀 `/api/plan/v3`。
- 实现：更新 `.env.example`、`prisma/seed.ts`、Ark 文本/图片/视频适配器默认说明、探针脚本、真实 E2E 脚本、`AGENTS.md`、`CLAUDE.md`、`docs/ENV.md`、`docs/E2E_TEST.md`；历史验收报告保留旧模型但明确标记为历史记录。
- 实现：`snapArkSeedanceDuration()` 同时识别 `seedance-2.0` 与 `seedance-2-0`，保证点号版 `doubao-seedance-2.0` 走 4 到 15 秒逻辑。
- 测试：新增 `src/__tests__/model-config.test.ts` 和 `src/__tests__/ark-video-duration.test.ts`，更新 `src/__tests__/utils.test.ts` 覆盖点号版 Seedance 2.0。
- 验证：`npx vitest run src/__tests__/model-config.test.ts src/__tests__/ark-video-duration.test.ts src/__tests__/utils.test.ts` 通过，3 个文件 8 个测试。
- 验证：`npm test` 通过，9 个文件 168 个测试。
- 验证：`npx tsc --noEmit` 通过。
- 验证：目标范围旧配置扫描无命中；剩余旧值仅存在于兼容性单元测试、规划日志审计或已标注的历史验收报告。

## 2026-06-28 18:08 90 秒《古城最后一盏花灯》真实 API 执行阻塞

- 门禁：当前角色 `developer`；消息来源为注册表中的 `product_planner` 线程 `019f0b54-4556-70d3-827f-3f95735ce808`；任务类型为开发执行任务；`registry.json` 中开发 Agent 允许必要业务代码/脚本调整。
- 环境：未读取或打印 `.env` / API Key；仅确认 `ARK_API_KEY` 和 `DATABASE_URL` 存在，`USE_MOCK_MODEL=false`。命令行显式覆盖 `ARK_API_BASE_URL=https://ark.cn-beijing.volces.com/api/plan`、`ARK_TEXT_MODEL=doubao-seed-2.0-pro`、`ARK_IMAGE_MODEL=doubao-seedream-5.0-lite`、`ARK_VIDEO_MODEL=doubao-seedance-2.0`。
- 服务：最初 3100 健康接口超时，重启本项目 Web 后 `/api/health` 和 `/api/worker/health` 恢复 healthy；PostgreSQL `127.0.0.1:15432` 和 Redis `127.0.0.1:16379` 可用。
- 执行命令：`npx tsx scripts/e2e-real-90s-heritage-quality.ts`，耗时 857 秒后在视频片段阶段失败。
- 产物进度：项目 `86e9a74a-d85f-4712-9fbe-619358ef74e0`，剧集 `3105b287-c8e4-4aee-91d4-3d32039206a0`。已生成并确认角色参考图 5 张、场景参考图 6 张、分镜图 9 张；视频片段 0 个，最终 MP4 未生成。
- 第一次视频失败：任务 `ac7f7056-9002-4cf9-8c55-52aaca0c535c`，公共 `ARK_API_BASE_URL=/api/plan` 路径下返回 404 `UnsupportedModel`，错误含义为 `doubao-seedance-2.0` 不支持当前 agent plan feature。
- 恢复尝试：重启 worker，保留公共 `/api/plan`，仅增加 `ARK_VIDEO_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3` 后从视频阶段重新创建任务。
- 第二次视频失败：任务 `29f0ea7f-609c-4ffd-bd4f-40bed626d3c0`，视频专用 `/api/v3` 路径下返回 401 `AuthenticationError`，错误含义为当前凭据在核心视频端点缺失或无效。
- 阻塞结论：当前指定的 `doubao-seedance-2.0` + `/api/plan` 无法创建视频任务；改用核心 `/api/v3` 又受凭据/授权阻塞。无法产出 MP4，因此无法执行 ffprobe、逐帧导出或交 QA 做视频质检。
- 已生成资产摘要：角色图 5 张位于 `/api/media/projects/86e9a74a-d85f-4712-9fbe-619358ef74e0/images/...`；场景图 6 张位于 `/api/media/projects/86e9a74a-d85f-4712-9fbe-619358ef74e0/images/episodes/3105b287-c8e4-4aee-91d4-3d32039206a0/scenes/...`；分镜图 9 张位于 `/api/media/projects/86e9a74a-d85f-4712-9fbe-619358ef74e0/images/...`。
- 收尾：本次专用 Web/Worker 已停止；确认无 3100 监听、无该项目 pending/running/retrying 任务。按团队规则交回规划 Agent 决定是否更换视频模型、开通/更换 Ark 凭据或调整视频端点策略。

## 2026-06-28 19:10 Seedance 1.5 Pro 恢复 90 秒真实 MP4

- 门禁：当前角色 `developer`；消息来源为注册表中的 `product_planner` 线程 `019f0b54-4556-70d3-827f-3f95735ce808`；任务类型为开发返工任务；`registry.json` 中开发 Agent 允许本次必要业务代码、脚本与文档调整。
- 配置：按老板最新决策将 Medium Agent Plan 当前视频默认策略改为 `doubao-seedance-1.5-pro`；文本模型保留 `doubao-seed-2.0-pro`，图片模型保留 `doubao-seedream-5.0-lite`，`ARK_API_BASE_URL` 保留 `https://ark.cn-beijing.volces.com/api/plan` 并由运行代码规范化到 `/api/plan/v3`。
- 实现：更新 `src/server/model-adapters/model-config.ts`、`src/server/model-adapters/ark-video.adapter.ts`、`.env.example`、Ark 视频探针脚本、`docs/ENV.md`、`docs/E2E_TEST.md`、`AGENTS.md`、`CLAUDE.md` 及相关测试；文档注明 Seedance 2.0 是高套餐或开通后可选能力，不作为当前 Medium 默认视频模型。
- 时长逻辑：保持 Seedance 1.5 图生视频 4 到 12 秒约束；保留 Seedance 2.0 点号与横线写法 4 到 15 秒识别测试。当前 9 个 10 秒镜头符合 1.5 上限。
- 测试：`npx vitest run src/__tests__/model-config.test.ts src/__tests__/ark-video-duration.test.ts src/__tests__/utils.test.ts` 通过，3 个文件 8 个测试。
- 测试：`npm test` 通过，9 个文件 168 个测试。
- 测试：`npx tsc --noEmit` 通过。
- 环境：未读取或打印 `.env` / API Key；真实运行通过项目正常启动链路加载必要环境，并在命令行显式覆盖 `USE_MOCK_MODEL=false`、`ARK_API_BASE_URL=https://ark.cn-beijing.volces.com/api/plan`、`ARK_TEXT_MODEL=doubao-seed-2.0-pro`、`ARK_IMAGE_MODEL=doubao-seedream-5.0-lite`、`ARK_VIDEO_MODEL=doubao-seedance-1.5-pro`。
- 服务：启动 Web `npm run dev` 与 Worker `npm run worker` 后，`/api/health` 与 `/api/worker/health` 均返回 healthy；PostgreSQL `127.0.0.1:15432` 与 Redis `127.0.0.1:16379` 走既有项目链路。
- 恢复执行：复用项目 `86e9a74a-d85f-4712-9fbe-619358ef74e0` 与剧集 `3105b287-c8e4-4aee-91d4-3d32039206a0`，从视频阶段执行本地 Node 恢复脚本；没有重跑已确认的角色图、场景图或分镜图。视频任务 `f8172ea6-7c72-46d7-b4e8-660b7c859077` 成功，最终渲染任务 `912a12f9-b09d-4a43-8a72-3fe512db6956` 成功；恢复耗时 414 秒。
- 视频片段：9 个视频片段均已确认，数据库视频 ID 为 `70fb7983-ed7f-45e0-a047-d76f274673f2`、`7c885022-0a3a-4d62-acd9-a024189e327d`、`f4fb18d0-f17b-4dd8-9831-2978c887b5ef`、`9ebda114-e0c2-4fd5-a9bf-e80657cd1e8f`、`7b722e6c-9ca5-4dc0-b457-4b5a9da164cd`、`c4695e61-5704-428c-a48a-dd04d2cd700d`、`73e5ca5e-2367-4dd9-8e3e-ccb283a0eb3c`、`491dddde-02d2-4b72-8dcc-030e4139433e`、`4541c727-f042-41ba-8a47-cefddc16937b`；未在日志中记录远端签名 URL。
- 最终 MP4：`/Users/xuegang/Desktop/My Project/manjv-studio/uploads/final_videos/86e9a74a-d85f-4712-9fbe-619358ef74e0_ep1_1782644453931.mp4`，文件大小 57,003,976 字节。
- ffprobe：容器 `mov,mp4,m4a,3gp,3g2,mj2`；总时长 `90.488005` 秒；视频流 H.264，`1080x1920`，`r_frame_rate=25/1`，`duration=90.480000`；音频流 AAC，`duration=90.488005`。
- QA 素材：全帧缩略序列 `/tmp/manjv_review_90s_86e9/frames_24fps`，共 2262 张 JPG，25fps 顺序导出，宽 270px；分镜 contact sheet `/tmp/manjv_review_90s_86e9/contact_sheets`，共 9 张，每镜头 1 张；角色/场景/分镜图素材目录为 `/Users/xuegang/Desktop/My Project/manjv-studio/uploads/media/projects/86e9a74a-d85f-4712-9fbe-619358ef74e0`。
- 收尾：专用 Web/Worker 已停止，Worker 显示 0 个运行中任务并优雅退出；确认 3100 无监听。准备按团队规则交 QA Agent 做完整观看与逐帧/帧序列质检。

## 2026-06-29 09:32 项目清理、文档统一与推送前验收

- 门禁：当前角色 `developer`；消息来源为注册表中的 `product_planner` 线程 `019f0b54-4556-70d3-827f-3f95735ce808`；任务类型为开发任务；`registry.json` 中开发 Agent 允许修改业务代码、依赖状态、文档、脚本和 Git 状态。未读取或打印 `.env` / API Key。
- Git：从 `main` 创建并切换到 `codex/cleanup-docs-deps`，保留前序未提交成果继续清理；远端为 `origin git@github.com:XueGang-AI/manjv-studio.git`。按任务要求，远端 push 等 QA 通过后再执行。
- 清理判断：保留 Worker 主循环、原子领取、崩溃恢复、retryCount、Redis 三连接重试、SSE 引用计数、AdapterFactory、Prompt 模板、角色/场景一致性、FFmpeg 两阶段合成和真实 API 验收脚本；未做无依据删除。
- 代码与文档：统一 9 步工作流口径，保留独立“场景参考图”步骤；从分镜图页面移除重复的内嵌场景参考展示，抽成 `src/components/scene-references/scene-reference-section.tsx` 并由独立路由使用；更新 README、AGENTS、CLAUDE、docs、.env.example、E2E/探针脚本到 3100 / 15432 / 16379 / Ark `/api/plan` / Medium 默认 Seedance 1.5 Pro。
- Docker：修正 Web 容器端口为 3100，`Dockerfile EXPOSE 3100`，`docker-compose.yml` 使用 `3100:3100`，healthcheck 改为 `http://localhost:3100/api/health`；PostgreSQL/Redis 不再暴露宿主默认 5432/6379。
- 真实验收记录：README、docs/E2E_TEST.md、docs/ARK_ONLY_CONSISTENCY_REFACTOR_REQUIREMENTS.md 已引用 2026-06-28 90 秒《古城最后一盏花灯》真实 API MP4 QA 通过记录；只记录 `uploads/final_videos/...mp4` 产物路径，不提交媒体产物。
- 依赖：源码和配置引用核查未发现可安全删除的 package.json 依赖；`npm prune --dry-run` 与 `npm prune` 均未修改 package/lock。`npm ls --depth=0` 仍显示 `@emnapi/core`、`@emnapi/runtime`、`@emnapi/wasi-threads`、`@napi-rs/wasm-runtime`、`@tybys/wasm-util` 为 node_modules extraneous，本地安装目录状态未能由 npm prune 收敛；这些包不在源码直接 import 中，也未改生产依赖。`npm prune` 同时报告 6 个 audit vulnerability（1 low, 5 moderate），本次不执行可能破坏锁定版本的 `npm audit fix --force`。
- 验证：`npm test` 通过，9 个文件 168 个测试；`npx tsc --noEmit` 通过；`npm run lint` 通过但有 2 个既有 `<img>` 性能 warning，均在 `src/components/shot-images/shot-image-review.tsx`；`git diff --check` 通过。
- 旧口径扫描：在排除 `node_modules`、生成媒体、screenshots、public、agents 审计日志后，`localhost:3000`、`localhost:3001`、旧 5432/6379、普通 Ark `/api/v3` 默认、Seedance 2.0 作为当前默认均无命中。旧模型名仅剩兼容性单元测试和已标注历史记录 `docs/REAL_API_60S_CONSISTENCY_VERIFICATION.md`。
- Smoke：3100 已有当前项目 Next dev 进程监听，未重启以免影响正在查看的视频。`curl http://localhost:3100/api/health` 返回 200 且 `success=true/status=healthy`；`curl` 90 秒成片 final-preview API 返回 200 且 `projectStatus=RENDERED`、`latest.status=READY`。
- 浏览器验证：使用本地浏览器打开 `/projects/86e9a74a-d85f-4712-9fbe-619358ef74e0/episodes/3105b287-c8e4-4aee-91d4-3d32039206a0/final-preview`，页面真实渲染 9 步导航和“最终视频已生成”，video 元素 `readyState=4`、`controls=true`、`1080x1920`，src 指向本地 MP4。
- 推送状态：本次清理已完成本地验证，尚未 commit/push；按团队流程先交 QA Agent 验收。QA 通过后再用建议提交信息 `chore: clean project docs dependencies and runtime config` 提交并推送 `codex/cleanup-docs-deps`。

## 2026-06-29 09:56 QA 返工：修复 Docker Worker `.env` 文件依赖

- 门禁：当前角色 `developer`；消息来源为注册表中的 `qa_reviewer` 线程 `019f0b54-cfca-7830-b6df-5826655ca038`；任务类型为验收不通过返工；`registry.json` 中开发 Agent 允许修复业务代码和配置。本次未读取或打印 `.env` / API Key。
- QA P1：`package.json` 的 `worker` 脚本使用 `node --env-file=.env --import tsx ...`，但 Docker 镜像不包含 `/app/.env`；compose 的 `env_file` 只注入环境变量，不创建文件，因此 worker 容器会在进入业务代码前失败。
- 修复：将 `worker` 脚本恢复为 `npx tsx src/server/workers/task.worker.ts`。Worker 入口 `src/server/workers/task.worker.ts` 继续保留 `dotenv.config()`，本地有 `.env` 时可加载，容器无 `.env` 时不会因缺文件被 Node 拒绝，compose environment 注入仍可生效。
- 复核：`rg` 扫描 `package.json`、Docker、compose、scripts、docs、AGENTS、README、src 后，运行配置中无 `--env-file` / `node --env-file` 残留。
- 验证：`npm test` 通过，9 个文件 168 个测试。
- 验证：`npx tsc --noEmit` 通过。
- 验证：`npm run lint` 通过，0 errors，2 warnings，仍为既有 `src/components/shot-images/shot-image-review.tsx` 的 `<img>` 性能提示。
- 验证：`git diff --check` 通过。
- 无 `.env` 复现：创建临时目录 `/tmp/manjv-noenv-worker.CtOKgF`，只复制 `package.json`/`tsconfig.json` 并软链接 `src`、`node_modules`，确认目录内不存在 `.env`。在该目录执行同一条 `npm run worker`，脚本进入 worker 入口并输出 `Task Worker starting...` / `Worker ID: noenv-smoke`；随后因故意设置 `DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/noenv_smoke?schema=public` 触发 Prisma `P1001 Can't reach database server` 退出。输出中无 `.env: not found`、`--env-file` 或 `env-file`，证明不再因缺失 `.env` 文件直接失败。
- Docker 说明：未执行 `docker compose config`，因为 compose 可能读取项目 `.env`；本次用无 `.env` 临时目录直接覆盖 QA 指出的 `npm run worker` 启动失败路径。
- 推送状态：仍未 commit/push；按流程重新交 QA 复验，通过后再提交并推送 `codex/cleanup-docs-deps`。

## 2026-06-29 10:09 QA 通过后的 Git 收尾

- 门禁：当前角色 `developer`；消息来源为注册表中的 `product_planner` 线程 `019f0b54-4556-70d3-827f-3f95735ce808`；任务类型为 Git 收尾授权；QA 已复验通过，允许本地 commit 并推送 `codex/cleanup-docs-deps`。本次未读取或打印 `.env` / API Key。
- 复核：当前分支为 `codex/cleanup-docs-deps`，远端为 `origin git@github.com:XueGang-AI/manjv-studio.git`；禁提交目录 `.env`、`uploads/`、`public/`、`screenshots/` 均处于 ignored 状态，未显示为待提交改动。
- 安全检查：`agents/` 目录只包含团队规则、注册表、日志和交接审计文件；提交前密钥扫描仅命中 `.env.example` 的占位 `your_ark_api_key` 和探针脚本的输出文件名，不是实际凭据。
- 收尾计划：按授权使用提交信息 `chore: clean project docs and runtime configuration`，提交后推送远端分支 `codex/cleanup-docs-deps`，并向规划 Agent 回传 commit hash、push 结果和最终状态。
