# Plan Log

## 2026-06-28 入职确认

- 已读取 `agents/TEAM_RULES.md` 与 `agents/registry.json`。
- 当前身份：`product_planner`，工位：`agents/plan/`。
- 门禁结论：不允许修改业务代码；当前无业务任务、无开发派单、无 QA 流转。
- 状态：规划 Agent 待命，等待老板下达第一个任务。

## 2026-06-28 Ark 模型配置核查与开发派单

- 消息来源：老板。
- 当前角色：`product_planner`，不允许修改业务代码。
- 任务目标：核查项目是否已切换到 `ARK_TEXT_MODEL=doubao-seed-2.0-pro`、`ARK_IMAGE_MODEL=doubao-seedream-5.0-lite`、`ARK_VIDEO_MODEL=doubao-seedance-2.0`，并确认 Ark base URL 是否统一为 `https://ark.cn-beijing.volces.com/api/plan`。
- 核查结论：未全部修改完成。`.env.example` 已包含文本和图片新模型及 `/api/plan`，但视频仍为 `doubao-seedance-1.5-pro`；`src/server/model-adapters/model-config.ts`、`prisma/seed.ts`、探针脚本、E2E 脚本、文档仍残留旧默认模型和 `/api/v3`；`ark-video.adapter.ts` 只识别 `seedance-2-0`，对 `doubao-seedance-2.0` 会走 1.5 i2v 的 12 秒限制。
- 已准备开发交接：要求开发 Agent 统一代码默认值、示例配置、seed、脚本和文档，并补充/更新测试，完成后交 QA 验收。

## 2026-06-28 Ark 模型配置 QA 通过

- 消息来源：QA Agent `qa_reviewer`，线程 `019f0b54-cfca-7830-b6df-5826655ca038`。
- 当前角色：`product_planner`，只做最终汇报，不修改业务代码。
- QA 结论：验收通过。
- 已完成范围：`.env.example`、运行时 model-config、AdapterFactory 路径、seed、探针脚本、真实 E2E 脚本、相关文档均已统一到 `doubao-seed-2.0-pro`、`doubao-seedream-5.0-lite`、`doubao-seedance-2.0` 与 `https://ark.cn-beijing.volces.com/api/plan`；`doubao-seedance-2.0` 点号写法已按 4-15 秒识别。
- QA 验证：`npx vitest run src/__tests__/model-config.test.ts src/__tests__/ark-video-duration.test.ts src/__tests__/utils.test.ts` 通过；`npm test` 通过；`npx tsc --noEmit` 通过。
- 残余风险：未调用真实 Ark API，不验证供应商侧模型开通状态或 `/api/plan/v3` 线上可用性；工作树存在本任务外改动，QA 未评价无关改动。

## 2026-06-28 90 秒真实 API 视频生成与一致性检查派单

- 消息来源：老板。
- 当前角色：`product_planner`，不允许修改业务代码或替开发/QA 执行真实生成。
- 任务目标：用真实 Ark API 起跑 1 分半测试，题材为文旅 / 非遗 / 返乡创业《古城最后一盏花灯》：女孩用直播救下快消失的手艺摊；重点场景为古城夜市、灯坊、直播摊位；审美方向为东方美学、场景氛围、商品/道具一致性。
- 项目现状：已有脚本 `scripts/e2e-real-90s-heritage-quality.ts`，内容为 9 个 10 秒镜头，覆盖古城夜市、花灯工坊、古城拱桥直播摊位，输出最终 MP4 到 `uploads/final_videos/`。
- 开发交接要求：启动本地 Web + Worker 与真实 API 环境，运行 90 秒真实生成脚本，产出 MP4、项目 ID、剧集 ID、日志和中间资产路径；不得读取或展示 API Key；如脚本与老板要求有差异，只做必要的精准调整。
- QA 验收要求：完整观看 MP4，并对导出的全帧或可审计帧序列进行人物一致性、场景一致性、花灯/手机/摊位/纸样等道具一致性、东方美学氛围、伪文字和画面瑕疵检查；输出问题清单、严重程度、出现镜头/时间段、优化建议。
- 状态：准备向开发 Agent 派发。

## 2026-06-28 90 秒真实 API 视频阶段阻塞

- 消息来源：开发 Agent `developer`，线程 `019f0b54-8659-7e51-9b4e-c97a04278a4f`。
- 当前角色：`product_planner`，不修改业务代码；该阻塞需要老板决策模型、端点或凭据策略。
- 执行结论：未生成最终 MP4，不能进入 QA 逐帧质检。
- 已完成中间产物：项目 `86e9a74a-d85f-4712-9fbe-619358ef74e0`，剧集 `3105b287-c8e4-4aee-91d4-3d32039206a0`；角色参考图 5 张、场景参考图 6 张、分镜图 9 张均已生成并确认；视频片段 0 个，最终成片 0 个。
- 失败路径 1：`ARK_API_BASE_URL=https://ark.cn-beijing.volces.com/api/plan` + `ARK_VIDEO_MODEL=doubao-seedance-2.0` 创建视频返回 404 `UnsupportedModel`，关键信息为该模型不支持 agent plan feature。
- 失败路径 2：保留公共 `/api/plan`，单独给 Worker 增加 `ARK_VIDEO_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3` 后重试视频阶段，返回 401 `AuthenticationError`，关键信息为当前请求凭据缺失或无效。
- 开发已确认：`USE_MOCK_MODEL=false`；`ARK_API_KEY` 与 `DATABASE_URL` 存在但未读取或展示；Web、Worker、PostgreSQL、Redis 均曾恢复 healthy；阻塞不是脚本缺失或服务未启动。
- 可复用资产：当前项目已生成角色图、场景图、分镜图，后续可从视频阶段恢复，不必重跑前半段。
- 待老板决策：是否继续坚持 `doubao-seedance-2.0 + /api/plan` 并先在 Ark 控制台开通支持；是否提供/切换可用于 `/api/v3` 视频任务的凭据；或是否允许视频阶段改用账号已授权的 Seedance 模型/端点组合。

## 2026-06-28 Ark 控制台 Agent Plan 页面核查

- 消息来源：老板要求查看 `https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=agentPlan`。
- 当前角色：`product_planner`，只查看控制台并记录结论，不修改业务代码或控制台配置。
- 控制台状态：Agent Plan 页显示套餐类型为 `Medium 套餐`，订阅状态 `生效中`，开始时间 `2026-06-16 16:20`，结束时间 `2026-07-16 23:59`，剩余 `19天`。
- Base URL 说明：Anthropic 兼容工具使用 `https://ark.cn-beijing.volces.com/api/plan`；OpenAI 兼容工具使用 `https://ark.cn-beijing.volces.com/api/plan/v3`；页面提示不要使用 `https://ark.cn-beijing.volces.com/api/v3`，否则会产生额外费用。
- 视觉模型页发现：可见模型包括 `doubao-seedance-2.0`、`doubao-seedance-1.5-pro`、`doubao-seedream-5.0-lite`；视频生成任务端点显示为 `https://ark.cn-beijing.volces.com/api/plan/v3/contents/generations/tasks`。
- 关键限制：页面提示“当前视觉模型不支持通过 Auto 及控制台切换使用，Medium 套餐暂不支持 Seedance 2.0 系列模型”。这与开发阶段 `doubao-seedance-2.0 + /api/plan` 返回 `UnsupportedModel` 一致。
- 初步策略判断：当前应避免继续用 `doubao-seedance-2.0` 跑 Medium Agent Plan 视频阶段；更可行的恢复方向是允许视频阶段改用控制台列出的 `doubao-seedance-1.5-pro` + `/api/plan/v3/contents/generations/tasks`，或升级/开通支持 Seedance 2.0 的套餐后再重试。

## 2026-06-28 授权修改为 Seedance 1.5 视频恢复方案

- 消息来源：老板回复“修改吧”。
- 当前角色：`product_planner`，不直接修改业务代码；需要派发给开发 Agent 执行。
- 决策解释：在当前 Ark Agent Plan Medium 套餐下，`doubao-seedance-2.0` 不支持视频生成；为了完成 90 秒真实 API MP4 测试，授权视频阶段改用控制台可见的 `doubao-seedance-1.5-pro`。
- 调整目标：文本模型继续用 `doubao-seed-2.0-pro`，图片模型继续用 `doubao-seedream-5.0-lite`，视频模型改为 `doubao-seedance-1.5-pro`，base URL 继续使用 `https://ark.cn-beijing.volces.com/api/plan` 并由代码规范化到 `/api/plan/v3`。
- 开发要求：更新运行默认值、示例配置、真实 E2E/探针脚本和文档说明，保留 Seedance 2.0 为高套餐可选能力说明；从已有项目 `86e9a74a-d85f-4712-9fbe-619358ef74e0` / 剧集 `3105b287-c8e4-4aee-91d4-3d32039206a0` 的已确认分镜图继续视频阶段恢复，不重跑角色图、场景图和分镜图。
- 验收要求：生成最终 MP4 后交 QA 完整观看和逐帧/可审计帧序列检查，重点仍是人物一致性、场景一致性、花灯/手机/摊位/纸样等道具一致性与优化建议。

## 2026-06-28 Seedance 1.5 Pro 90 秒 MP4 QA 通过

- 消息来源：QA Agent `qa_reviewer`，线程 `019f0b54-cfca-7830-b6df-5826655ca038`。
- 当前角色：`product_planner`，只做最终汇报，不修改业务代码。
- QA 结论：可接受，通过；存在 P2 质量风险，不阻断本次 90 秒真实 API MP4 验收。
- 验收对象：项目 `86e9a74a-d85f-4712-9fbe-619358ef74e0`，剧集 `3105b287-c8e4-4aee-91d4-3d32039206a0`，最终 MP4 `uploads/final_videos/86e9a74a-d85f-4712-9fbe-619358ef74e0_ep1_1782644453931.mp4`。
- 媒体复核：MP4 总时长 `90.488005` 秒，大小 `57,003,976` 字节；视频 H.264 `1080x1920`，25fps，`2259` 帧；音频 AAC，时长 `90.488005` 秒。
- 审计素材：`/tmp/manjv_review_90s_86e9/frames_24fps` 共 2262 张 JPG，并有 QA contact sheet 与问题细节图。
- 自动扫描：无黑屏事件、无 1 秒以上冻结、无 2 秒以上静音；音频整体 RMS 约 `-45.8 dB`，偏低但不是无声。
- 验证命令：`npx vitest run src/__tests__/model-config.test.ts src/__tests__/ark-video-duration.test.ts src/__tests__/utils.test.ts` 通过；`npm test` 通过；`npx tsc --noEmit` 通过。
- 视觉结论：9 个镜头连贯；古城夜市、工坊、拱桥直播三类空间基本稳定；鱼龙花灯、竹篾、旧纸样、手机支架、直播摊位、红绳手链等主要道具可辨认并基本连续；无字幕、水印或可读伪文字。
- P2 风险：第 6 镜头约 50-60 秒脸型/发型轻微漂移；第 8 镜头约 70-80 秒发型偏长直披发、低马尾特征弱；第 7-9 镜头约 60-90 秒手机/直播画面有红色对勾和爱心图形，接近直播 UI 叠加；整体音频响度偏低。
- 后续优化建议：精品发布前局部重跑第 6、8、7-9 镜头，强化“低马尾、同一脸型、同一刘海轮廓”和“手机屏幕仅抽象光点、无平台图标/对勾/logo”约束，并按目标平台响度标准做音量归一化。

## 2026-06-29 项目清理、文档收束与 Git 推送派单

- 消息来源：老板。
- 当前角色：`product_planner`，不允许直接修改业务代码、删除业务文件、提交或推送；需要派发给开发 Agent。
- 任务目标：清理项目冗余代码、冗余依赖、冗余文件和冗余文档；把所有文档更新到当前真实架构与运行状态；完成验证后推送到 Git 仓库。
- 当前仓库状态：分支 `main`，远端 `origin git@github.com:XueGang-AI/manjv-studio.git`；工作树已有大量未提交改动，包括 Ark/Seedance 配置、90 秒真实 API 脚本、场景参考页、测试、文档、协作目录等。
- 初步风险：清理范围大且包含删除操作，必须先做引用关系扫描和差异审查；不得误删 Worker 任务系统、AdapterFactory、Prompt 模板、FFmpeg 两阶段合成、场景/角色一致性链路、真实 API 验收脚本、团队协作规则。
- 依赖现状：`npm ls --depth=0` 显示本地 `node_modules` 存在若干 extraneous 包，这是安装目录清理问题，是否影响 `package.json` 需由开发按源码 import 和 lockfile 核实。
- 文档收束原则：统一到当前真实状态：端口 `3100`，PostgreSQL `127.0.0.1:15432`，Redis `127.0.0.1:16379`，Ark Agent Plan base URL `/api/plan` 并运行规范化到 `/api/plan/v3`，文本 `doubao-seed-2.0-pro`，图片 `doubao-seedream-5.0-lite`，视频默认 `doubao-seedance-1.5-pro`，Seedance 2.0 为高套餐/开通后可选能力。
- Git 流程要求：优先创建 `codex/cleanup-docs-deps` 分支或在开发 Agent 判断合理时使用当前分支；提交前必须通过 QA。若直接推 `main` 有风险，先推分支并向规划说明 PR/合并建议。

## 2026-06-29 Docker Worker 无 .env 启动返工复验通过

- 消息来源：QA Agent `qa_reviewer`，线程 `019f0b54-cfca-7830-b6df-5826655ca038`。
- 当前角色：`product_planner`，不修改业务代码、不执行提交或推送；需要把后续 Git 操作交回开发 Agent。
- 复验结论：通过。上一轮 P1 已解除，开发可继续执行本地 commit 并推送 `codex/cleanup-docs-deps`。
- 复验目标：确认 Docker/生产 Worker 启动链路不再依赖容器内存在 `/app/.env` 文件，且修复不破坏测试、类型检查、lint 和 diff 空白检查。
- 关键证据：`package.json` 的 `worker` 脚本为 `npx tsx src/server/workers/task.worker.ts`；已移除 `node --env-file=.env --import tsx src/server/workers/task.worker.ts`；扫描 `--env-file|node --env-file` 无命中。
- 验证结果：`npm test` 通过，9 个文件 168 个测试；`npx tsc --noEmit` 通过；`npm run lint` 通过，0 errors、2 个既有 `<img>` warning；`git diff --check` 通过。
- 无 `.env` 启动复现：QA 在临时无 `.env` 目录运行同一条 `npm run worker`，输出 Worker 启动信息和注册任务类型；随后因刻意设置无效数据库地址出现 Prisma `P1001`，未出现 `.env`、`--env-file` 或 `env-file` 启动错误。
- 下一步：向开发 Agent 发送继续 commit 并推送 `codex/cleanup-docs-deps` 的交接，要求推送成功后回传 commit、远端分支和状态。
