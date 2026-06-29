# QA Log

## 2026-06-28 07:44 Ark 新模型与 api/plan 配置统一验收

- 角色门禁：当前角色 `qa_reviewer`；消息来源线程 `019f0b54-8659-7e51-9b4e-c97a04278a4f` 匹配注册表中的开发 Agent；任务类型为验收交接；本角色 `may_modify_business_code=false`，本次不修改业务代码。
- 规划标准：从 `agents/plan/log.md` 确认目标为统一 `ARK_TEXT_MODEL=doubao-seed-2.0-pro`、`ARK_IMAGE_MODEL=doubao-seedream-5.0-lite`、`ARK_VIDEO_MODEL=doubao-seedance-2.0`、`ARK_API_BASE_URL=https://ark.cn-beijing.volces.com/api/plan`，并修复点号版 Seedance 2.0 的 4 到 15 秒识别。
- 产物复核：`.env.example` 四项目标值正确；`src/server/model-adapters/model-config.ts` 默认常量正确，`normalizeArkBaseUrl()` 会把 `/api/plan` 与 `/api/coding` 规范化到 `/v3`；`adapter.factory.ts` 文本/图片/视频运行路径均使用规范化后的 base URL；`prisma/seed.ts` 复用默认常量。
- 旧值扫描：执行规划范围旧值扫描，`doubao-seed-character-251128`、`doubao-seedream-5-0-260128`、`doubao-seedance-2-0-260128`、`doubao-seedance-1.5-pro`、`https://ark.cn-beijing.volces.com/api/v3` 在目标范围内无命中。
- 时长复核：`snapArkSeedanceDuration()` 已导出并同时识别 `seedance-2.0` 与 `seedance-2-0`；`src/lib/utils.ts` 已覆盖点号版 1.5 与 2.0；新增测试覆盖点号版 2.0 的 4 到 15 秒收口。
- 验证命令：`npx vitest run src/__tests__/model-config.test.ts src/__tests__/ark-video-duration.test.ts src/__tests__/utils.test.ts` 通过，3 个文件 8 个测试；`npm test` 通过，9 个文件 168 个测试；`npx tsc --noEmit` 通过。
- 残余风险：当前工作树存在大量本任务外未提交改动，本次验收未评价这些无关改动；未调用真实 Ark API，不验证供应商侧模型开通状态或 `/api/plan/v3` 线上可用性。
- 验收结论：通过。将通过结论、证据和残余风险交接给规划 Agent。

## 2026-06-28 19:22 Seedance 1.5 Pro 90 秒真实 MP4 质检

- 角色门禁：当前角色 `qa_reviewer`；消息来源线程 `019f0b54-8659-7e51-9b4e-c97a04278a4f` 匹配注册表中的开发 Agent；任务类型为验收交接；本角色 `may_modify_business_code=false`，本次不修改业务代码。
- 规划标准：从 `agents/plan/log.md` 确认 90 秒真实 API 视频任务与后续 Seedance 1.5 Pro 恢复授权；目标为复用项目 `86e9a74a-d85f-4712-9fbe-619358ef74e0` / 剧集 `3105b287-c8e4-4aee-91d4-3d32039206a0` 从视频阶段恢复，产出并质检 90 秒 MP4。
- 配置复核：`.env.example` 与 `src/server/model-adapters/model-config.ts` 当前视频默认值为 `doubao-seedance-1.5-pro`；`ARK_API_BASE_URL` 默认仍为 `https://ark.cn-beijing.volces.com/api/plan`，运行前规范化到 `/api/plan/v3`；文档说明 Seedance 2.0 为高套餐/开通后可选能力。
- MP4 元数据：`uploads/final_videos/86e9a74a-d85f-4712-9fbe-619358ef74e0_ep1_1782644453931.mp4` 存在；ffprobe 显示容器 `mov,mp4,m4a,3gp,3g2,mj2`，总时长 `90.488005` 秒，大小 `57003976` 字节；视频 H.264 `1080x1920`，`r_frame_rate=25/1`，视频流时长 `90.480000`，`nb_frames=2259`；音频 AAC，时长 `90.488005`。
- 帧序列复核：`/tmp/manjv_review_90s_86e9/frames_24fps` 有 2262 张 JPG；生成 QA 辅助图 `/tmp/manjv_review_90s_86e9/qa_1fps_sheets/`、`/tmp/manjv_review_90s_86e9/qa_all_frame_grids/`、`/tmp/manjv_review_90s_86e9/qa_contact_overview.jpg`、`/tmp/manjv_review_90s_86e9/qa_crops/problem_detail_sheet.jpg` 用于逐镜头和全帧网格复核。
- 自动媒体扫描：`blackdetect=d=0.5:pix_th=0.10` 无黑屏事件；`freezedetect=n=-60dB:d=1` 无 1 秒以上冻结事件；`silencedetect=n=-45dB:d=2` 无 2 秒以上静音事件；`astats` 无 NaN/Inf，整体 RMS 约 `-45.8 dB`，声音偏低但不是无声。
- 测试命令：`npx vitest run src/__tests__/model-config.test.ts src/__tests__/ark-video-duration.test.ts src/__tests__/utils.test.ts` 通过，3 个文件 8 个测试；`npm test` 通过，9 个文件 168 个测试；`npx tsc --noEmit` 通过。
- 视觉结论：90 秒成片技术可用，9 个镜头连贯，无黑屏、长冻结、无声、字幕、水印或可读伪文字；古城夜市、工坊、拱桥直播三类空间基本稳定；鱼龙花灯、竹篾、纸样、手机支架、红绳手链等主要道具可辨认。
- P2 问题 1：第 6 镜头约 50 到 60 秒，许澄脸型偏圆、发型偏侧马尾/短刘海，和第 1 到 5 镜头的低马尾基线有轻微漂移；可能原因是已确认分镜图本身风格漂移传导到视频。建议后续优化第 6 镜头确认图或角色参考约束。
- P2 问题 2：第 8 镜头约 70 到 80 秒，许澄发型偏长直披发，低马尾特征弱于前后镜头；可能原因同为分镜确认图/视频首帧角色约束不够强。建议后续重跑时强化“低马尾、同一脸型、同一刘海轮廓”。
- P2 问题 3：第 7 到 9 镜头约 60 到 90 秒，手机/直播画面出现红色对勾和爱心图形。未发现可读文字、伪中文、字幕、水印或明确 logo，但图形接近直播 UI 叠加；建议后续 prompt 明确“手机屏幕仅显示抽象光点/不可读界面，不出现平台图标、对勾或类似 logo 的符号”。
- P2 问题 4：音频轨存在且连续，但整体 RMS 约 `-45.8 dB`，主观可能偏低；建议发布前按目标平台响度标准再做一次音量归一化。
- 验收结论：可接受，通过。P2 问题不阻断本次 90 秒真实 API MP4 验收；将通过结论、证据、P2 问题和残余风险交接给规划 Agent。

## 2026-06-29 09:48 清理冗余代码依赖文件文档推送前 QA

- 角色门禁：当前角色 `qa_reviewer`；消息来源线程 `019f0b54-8659-7e51-9b4e-c97a04278a4f` 匹配注册表中的开发 Agent；任务类型为验收交接；本角色 `may_modify_business_code=false`，本次不修改业务代码。
- 分支与范围：当前分支 `codex/cleanup-docs-deps`，远端 `origin git@github.com:XueGang-AI/manjv-studio.git`；尚未 commit/push。未跟踪文件包含 `agents/` 审计与日志、真实 API E2E 脚本、新增场景参考页/组件与新增单元测试；未发现 `.env`、`uploads/`、`public/`、`screenshots/`、`scripts/output/` 待提交。
- 通过项：9 步工作流、3100 / 15432 / 16379、Ark `/api/plan` 规范化、文本 `doubao-seed-2.0-pro`、图片 `doubao-seedream-5.0-lite`、视频默认 `doubao-seedance-1.5-pro` 等当前口径在重点文件中一致；旧端口和普通 `/api/v3` 当前默认扫描无命中；旧模型仅在兼容性单元测试和已标注历史记录中出现。
- 通过项：`npm test` 通过，9 个文件 168 个测试；`npx tsc --noEmit` 通过；`npm run lint` 通过，0 errors，2 warnings，均为既有 `src/components/shot-images/shot-image-review.tsx` 的 `<img>` 性能提示；`git diff --check` 通过。
- 通过项：`npm prune --dry-run` 显示 up to date；`npm ls --depth=0` 仍显示本地 node_modules extraneous：`@emnapi/core`、`@emnapi/runtime`、`@emnapi/wasi-threads`、`@napi-rs/wasm-runtime`、`@tybys/wasm-util`，与源码直接依赖无关。
- 通过项：`curl http://localhost:3100/api/health` 返回 200，`success=true/status=healthy`；`curl .../final-preview` 返回 200，`projectStatus=RENDERED`、`latest.status=READY`；3100 当前由本项目 Node 进程监听。
- 通过项：应用内浏览器打开最终预览页成功，页面显示 9 步导航和“最终视频已生成”；`video` 元素 `readyState=4`、`controls=true`、`1080x1920`，`src` 指向本地 MP4；浏览器控制台无 error/warn。点击 9 步导航的“场景参考图”后进入独立页面，显示场景参考图、补齐场景参考图、进入分镜图，控制台无 error/warn。
- 依赖风险：`npm audit --audit-level=low` 报 6 个漏洞（1 low, 5 moderate），其中部分 fix 需要 breaking changes；该项与开发交接一致，未作为本次阻断。
- 阻断问题 P1：`package.json` 的 `worker` 脚本改为 `node --env-file=.env --import tsx src/server/workers/task.worker.ts`，但 `.dockerignore` 明确排除 `.env` / `.env.*`，Docker 镜像内不会有 `.env` 文件；`docker-compose.yml` 的 `env_file: .env` 只把变量注入容器环境，不会在容器内创建 `/app/.env` 文件。复现命令：在无 `.env` 的临时目录执行 `node --env-file=.env -e "console.log('ok')"`，Node 直接退出 `node: .env: not found`。因此 `docker compose` 的 worker 容器执行 `npm run worker` 会启动失败，破坏任务系统独立 Worker 链路。
- 修复要求：不要让生产/容器 worker 启动依赖容器内存在 `.env` 文件。建议恢复为 `npx tsx src/server/workers/task.worker.ts` 或改为不强制缺失 `.env` 的启动方式；保留入口 `dotenv.config()` 和 compose environment 注入即可。修复后至少复跑 `npm test`、`npx tsc --noEmit`、`npm run lint`、`git diff --check`，并用无 `.env` 环境复现 `npm run worker` 不再因 `--env-file=.env` 退出；如能跑 Docker，补充 `docker compose config` 或 worker 容器启动验证。
- 验收结论：不通过。退回 developer 修复 P1 后重新交 QA；当前不应 commit/push。

## 2026-06-29 10:04 Docker Worker .env 依赖返工复验

- 角色门禁：当前角色 `qa_reviewer`；消息来源线程 `019f0b54-8659-7e51-9b4e-c97a04278a4f` 匹配注册表中的开发 Agent；任务类型为返工复验交接；本角色 `may_modify_business_code=false`，本次不修改业务代码。
- 返工目标：复验上一轮 P1，确认 Docker/生产 worker 启动链路不再依赖容器内存在 `/app/.env` 文件；当前分支仍为 `codex/cleanup-docs-deps`，尚未 commit/push。
- 改动复核：`package.json` 的 `worker` 脚本当前为 `npx tsx src/server/workers/task.worker.ts`；`git diff -- package.json` 显示未再使用 `node --env-file=.env --import tsx`。
- 残留扫描：执行 `rg -n -- "--env-file|node --env-file" package.json Dockerfile docker-compose.yml scripts docs AGENTS.md README.md src`，无命中。
- 回归验证：`npm test` 通过，9 个文件 168 个测试；`npx tsc --noEmit` 通过；`npm run lint` 通过，0 errors，2 warnings，仍为既有 `src/components/shot-images/shot-image-review.tsx` 的 `<img>` 性能提示；`git diff --check` 通过。
- 无 `.env` 复现：创建临时目录 `/tmp/manjv-noenv-worker-qa.v3KEDj`，仅复制 `package.json` / `tsconfig.json`，软链接 `src` 与 `node_modules`，确认目录内无 `.env`；执行同一条 `npm run worker`，并显式传入无效测试连接 `DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/noenv_smoke?schema=public`、`REDIS_URL=redis://127.0.0.1:1`、`NODE_ENV=test`、`WORKER_ID=qa-noenv-smoke`。
- 复现结果：输出包含 `[worker] Task Worker starting...`、`Worker ID: qa-noenv-smoke` 和已注册任务类型，随后因刻意设置的无效数据库地址触发 Prisma `P1001 Can't reach database server at 127.0.0.1:1`；输出中未出现 `.env: not found`、`--env-file` 或 `env-file` 启动错误。
- 结论：P1 已解除。Docker/生产环境通过环境变量注入配置时，`npm run worker` 不会再因缺失容器内 `.env` 文件在 Node 入口前失败；允许 developer 继续本地 commit 并推送 `codex/cleanup-docs-deps`。将通过结论、证据和剩余注意事项交接给规划 Agent。
