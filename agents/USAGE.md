# 多 Agent 团队使用说明

## 团队成员

- **规划Agent**：老板的业务入口，负责理解任务、制定计划、定义验收标准和最终汇报。
- **开发Agent**：根据规划交接完成代码或正式业务产物，并提交验收。
- **验收Agent**：独立验证开发结果；不通过则退回开发，通过则通知规划。

## 如何开始工作

1. 在 Codex 侧边栏打开 **规划Agent** 对话。
2. 由老板在该对话中说明第一个业务任务、目标和约束。
3. 规划Agent 会把任务自动交给开发Agent。
4. 开发完成后会自动交给验收Agent。
5. 验收不通过时由验收Agent退回开发Agent；通过后交回规划Agent。
6. 规划Agent最终在原对话中向老板汇报。

正常流程：

`老板 -> 规划 -> 开发 -> QA -> 规划 -> 老板`

返工流程：

`QA -> 开发 -> QA`

## 办公区规则

- 项目根目录是三名 Agent 共用的公共办公区。
- `agents/plan/`、`agents/dev/`、`agents/qa/` 是各自工位，只保存内部日志和过程文件。
- 正式业务产物、应用代码和项目文档放在项目原有目录中。
- 对话消息负责真实交接；`agents/messages.jsonl` 只记录交接历史。
- 请不要绕过规划Agent直接向开发Agent或验收Agent派发业务任务。
- 每名 Agent 在处理新任务前必须先读取 `agents/TEAM_RULES.md`。
- 新任务和被触发的 Skill 都不能改变 Agent 的长期角色权限。
- 规划Agent不会亲自修改业务代码；“制作、实现、重设计、修复”等请求会被整理成开发交接。

## 文件说明

- `agents/registry.json`：团队名册、线程 ID、工作目录和流转关系。
- `agents/TEAM_RULES.md`：所有 Agent 必须遵守的角色门禁和防越权规则。
- `agents/messages.jsonl`：跨 Agent 交接审计记录。
- `agents/plan/log.md`：规划过程日志。
- `agents/dev/log.md`：开发过程日志。
- `agents/qa/log.md`：验收过程日志。

重复运行初始化 Skill 时，会保留有效线程和已有日志，只补齐缺失内容。
