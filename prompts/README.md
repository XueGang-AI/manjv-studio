# Prompt 模板库

此目录存放 AI 漫剧生产工作台的所有 Prompt 模板。

## 目录结构

```
prompts/
  story/         — 故事分析、故事创作、小说改编、剧情优化
  character/     — 角色设计、关系网络
  storyboard/    — 分镜脚本、开场钩子、结尾悬念、分镜画面库
  image/         — 图片 Prompt、角色视觉、场景、表情、画风、镜头、光影
  video/         — 视频 Prompt、图生视频、运镜、特效
  camera/        — 镜头知识库、运镜分类
  style/         — 电影风格库
  audio/         — 配音文案
  platform/      — 平台优化、标题文案
  qc/            — 文本/图片/视频质量检查
```

## 同步方式

模板源文件维护在本目录。运行以下命令会将 `.prompt` 与 `.json` 模板同步到数据库 `prompt_templates` 表：

```bash
npm run db:seed
```

业务代码通过 `PromptTemplateService.render()` 按模板名称读取和填充变量，禁止在 Handler 中硬编码 Prompt。

## 模板格式

每个 `.prompt` 文件包含：
- System Prompt（指导模型行为）
- User Prompt 模板（含 `{{变量}}`）
- JSON Schema 输出约束

每个 `.json` 文件包含结构化的标签/修饰词库。
