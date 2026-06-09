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

## 状态

**当前阶段：Phase 1 — 目录结构预留**

Phase 2 将解析以下 17 个专业文件并填充此目录：
- AI漫剧创作专业版提示词.docx
- 漫剧提示词创作合集.doc
- 【先看这个】分镜画面提示词.xlsx
- 300+电影风格提示词.csv
- 即梦100多组神级指令合集.xlsx
- AI视频脚本分镜模板_共300条.xlsx
- seedance2.0分镜提示词模板.txt
- 12组电影级组合运镜提示词.docx
- 十大经典运镜教程.docx
- 特效运镜.docx
- 运镜教学.doc
- 运镜提示词.doc
- 组合运镜.docx
- 组合运镜2.docx
- 提示词大全（在夸克）.docx
- 以及分镜提示词整理和小说漫剧提示词目录下的文件

## 模板格式

每个 `.prompt` 文件包含：
- System Prompt（指导模型行为）
- User Prompt 模板（含 `{{变量}}`）
- JSON Schema 输出约束

每个 `.json` 文件包含结构化的标签/修饰词库。
