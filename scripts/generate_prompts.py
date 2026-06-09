#!/usr/bin/env python3
"""
整合所有中间解析结果，生成 .prompt 模板文件和 .json 素材库文件
"""
import json, os, re

BASE = "/Users/xuegang/Desktop/My Project/manjv-studio"
PROMPTS_DIR = f"{BASE}/prompts"
OUTPUT_DIR = f"{BASE}/scripts/output"

# ============================================
# 读取所有中间解析结果
# ============================================

def load_json(filename):
    path = f"{OUTPUT_DIR}/{filename}"
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None

txt_data = load_json("txt_parsed.json") or []
csv_data = load_json("csv_parsed.json") or {}
xlsx_data = load_json("xlsx_parsed.json") or []
docx_data = load_json("docx_parsed.json") or []

# Load doc text files
doc_texts = {}
for fname in ["doc_漫剧提示词创作合集.txt", "doc_运镜提示词.txt", "doc_运镜教学.txt"]:
    path = f"{OUTPUT_DIR}/{fname}"
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            doc_texts[fname] = f.read()

# ============================================
# 辅助函数
# ============================================

def write_prompt(rel_path, content, source_file):
    """写入 .prompt 文件"""
    full_path = f"{PROMPTS_DIR}/{rel_path}"
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    # Header comment with metadata
    header = f"""# ============================================
# Prompt 模板: {os.path.basename(rel_path)}
# 来源文件: {source_file}
# 分类: {rel_path.split('/')[0]}
# ============================================

"""
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(header + content)
    return full_path

def write_json_lib(rel_path, data, source_file):
    """写入 JSON 素材库文件"""
    full_path = f"{PROMPTS_DIR}/{rel_path}"
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    output = {
        "_meta": {
            "file": os.path.basename(rel_path),
            "category": rel_path.split('/')[0],
            "source_file": source_file,
            "total_entries": len(data) if isinstance(data, list) else len(data.get("entries", [])),
        },
        "entries": data if isinstance(data, list) else data.get("entries", data)
    }
    with open(full_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    return full_path

def extract_variables(template_text):
    """从模板文本中提取所有 {{变量}} """
    return list(set(re.findall(r'\{\{(\w+)\}\}', template_text)))

# ============================================
# 计数器
# ============================================
prompt_count = [0]
json_count = [0]

# ============================================
# 1. STORY 分类: story_analysis.prompt
# ============================================
print("\n📝 Generating STORY prompts...")

story_analysis = """## System Prompt
你是资深 AI 漫剧创作专家，精通将小说、故事梗概、剧本创意改编为短视频漫剧。
你必须输出可被程序解析的 JSON。不要输出 Markdown，不要输出解释性废话。
所有字段必须完整，如果信息不足，使用空字符串、空数组或合理默认值。
创作目标是短视频漫剧，节奏要快，画面感要强，台词要口语化。
每集开头必须有强钩子，每集结尾必须有悬念。输出内容必须适配 {{aspect_ratio}} 竖屏短视频。

## User Prompt
请根据以下用户信息生成完整故事方案：

- 项目名称：{{project_name}}
- 故事类型：{{story_type}}
- 故事背景：{{background}}
- 主要角色：{{main_characters}}
- 核心冲突：{{core_conflict}}
- 故事梗概：{{story_summary}}
- 完整故事：{{full_story}}
- 目标平台：{{target_platform}}
- 期望画风：{{art_style}}
- 预计集数：{{episode_count}}
- 单集时长：{{episode_duration}}
- 目标受众：{{audience}}
- 结局方向：{{ending_type}}

创作要求：
1. 提取题材类型、时代背景、核心冲突、情感基调
2. 列出 3-5 个核心角色，包括主角、配角、反派
3. 提取 3-5 个最具画面感和情绪冲击力的爆点场景
4. 生成核心卖点，突出爽点、虐点、甜点、悬念点
5. 按预计集数生成分集大纲
6. 每集必须有一个核心剧情任务和结尾钩子

## Output JSON Schema
{
  "basic_info": {
    "genre": "string",
    "background": "string",
    "core_conflict": "string",
    "emotional_tone": "string",
    "target_audience": "string",
    "platform": "string"
  },
  "selling_points": ["string"],
  "core_characters": [
    {
      "name": "string",
      "role_type": "主角|配角|反派",
      "brief_identity": "string",
      "story_function": "string"
    }
  ],
  "highlight_scenes": [
    {
      "scene_name": "string",
      "visual_description": "string",
      "emotional_impact": "string",
      "story_value": "string"
    }
  ],
  "episode_outline": [
    {
      "episode_no": 1,
      "title": "string",
      "core_plot": "string",
      "hook": "string",
      "emotion": "string",
      "duration": {{episode_duration}}
    }
  ],
  "platform_suggestion": {
    "opening_strategy": "string",
    "subtitle_style": "string",
    "title_direction": "string",
    "interaction_question": "string"
  }
}

## Variables
{{project_name}}, {{story_type}}, {{background}}, {{main_characters}}, {{core_conflict}}, {{story_summary}}, {{full_story}}, {{target_platform}}, {{art_style}}, {{episode_count}}, {{episode_duration}}, {{aspect_ratio}}, {{audience}}, {{ending_type}}
"""
write_prompt("story/story_analysis.prompt", story_analysis, "AI漫剧创作专业版提示词.docx")
prompt_count[0] += 1

# ============================================
# 2. STORY: story_creation.prompt
# ============================================
story_creation = """## System Prompt
你是专业 AI 漫剧编剧，擅长创作符合短视频平台传播规律的原创故事。
你必须输出 JSON，不要输出 Markdown 或解释文字。
故事必须有强冲突、快节奏、高密度反转。目标平台：{{target_platform}}。

## User Prompt
请根据以下设定创作原创故事：

- 故事类型：{{story_type}}
- 画风偏好：{{art_style}}
- 目标平台：{{target_platform}}
- 预计集数：{{episode_count}}
- 单集时长：{{episode_duration}}秒
- 画面比例：{{aspect_ratio}}

创作要求：
1. 核心冲突必须在前 3 集内建立
2. 每 30 秒设置一个反转或情绪高点
3. 结局留悬念，引导追更
4. 角色不超过 5 个核心人物
5. 台词短句为主，每句不超过 15 字
6. 大量使用视觉画面和肢体语言代替冗长对白

## Output JSON Schema
{
  "basic_info": {
    "genre": "string",
    "background": "string",
    "core_conflict": "string",
    "emotional_tone": "string"
  },
  "characters": [
    {
      "name": "string",
      "role": "string",
      "brief_description": "string"
    }
  ],
  "episode_outline": [
    {
      "episode_no": 1,
      "title": "string",
      "core_plot": "string",
      "hook": "string"
    }
  ]
}

## Variables
{{project_name}}, {{story_type}}, {{art_style}}, {{target_platform}}, {{episode_count}}, {{episode_duration}}, {{aspect_ratio}}
"""
write_prompt("story/story_creation.prompt", story_creation, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 3. STORY: plot_optimization.prompt
# ============================================
plot_opt = """## System Prompt
你是短视频漫剧剧情节奏优化专家，擅长诊断剧情节奏问题并提供具体解决方案。
你必须输出 JSON，不要输出 Markdown 或解释文字。

## User Prompt
请分析以下剧情节奏问题：

当前剧情：{{story_package_json}}

优化要求：
1. 检查是否每 5 秒有信息增量
2. 检查开场 3 秒是否有足够冲击力
3. 检查结尾是否有悬念
4. 检查是否有拖沓或重复的镜头
5. 给出具体到镜头的优化建议

## Output JSON Schema
{
  "overall_score": 80,
  "issues": [
    {
      "shot_no": 1,
      "problem": "string",
      "suggestion": "string",
      "severity": "high|medium|low"
    }
  ],
  "rewritten_shots": [
    {
      "shot_no": 1,
      "new_action": "string",
      "new_dialogue": "string"
    }
  ]
}

## Variables
{{story_package_json}}, {{storyboard_json}}
"""
write_prompt("story/plot_optimization.prompt", plot_opt, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 4. CHARACTER: character_design.prompt
# ============================================
char_design = """## System Prompt
你是专业短视频漫剧角色设计师。请根据故事方案，为每个核心角色生成完整角色设定卡。
你必须输出 JSON，所有字段必须完整。

## User Prompt
输入故事方案：{{story_package_json}}

设计要求：
1. 每个角色必须有清晰的视觉辨识度
2. 外貌特征必须具体到可以直接用于 AI 绘图
3. 每个角色必须有 3 套服装：日常装、正式装、特殊装
4. 每个角色必须有 2-3 个标志性元素，例如耳钉、疤痕、纹身、发饰、项链等
5. 每个角色必须输出中文固定绘图关键词和英文固定绘图关键词
6. 角色设定必须适配 {{art_style}} 画风
7. 主角必须具备后续多镜头复用能力，描述要稳定、明确、可复用

## Output JSON Schema
{
  "characters": [
    {
      "name": "string",
      "gender": "男|女",
      "age": 25,
      "role_type": "女主|男主|配角|反派",
      "identity": "string",
      "appearance": {
        "face_shape": "string",
        "eyes": "string",
        "eyebrows": "string",
        "nose": "string",
        "lips": "string",
        "skin": "string",
        "hair_style": "string",
        "hair_color": "string",
        "body_shape": "string",
        "height": "string"
      },
      "clothing": {
        "daily": {"top": "string", "bottom": "string", "shoes": "string", "accessories": "string"},
        "formal": {"top": "string", "bottom": "string", "shoes": "string", "accessories": "string"},
        "special": {"top": "string", "bottom": "string", "shoes": "string", "accessories": "string"}
      },
      "personality": {
        "tags": ["string"],
        "strengths": ["string"],
        "weaknesses": ["string"],
        "desire": "string",
        "fear": "string"
      },
      "signature_features": ["string"],
      "language_style": {
        "daily": "string",
        "angry": "string",
        "sad": "string",
        "sample_lines": ["string"]
      },
      "action_habits": ["string"],
      "zh_fixed_prompt": "string - Chinese fixed prompt for image generation",
      "en_fixed_prompt": "string - English fixed prompt for image generation",
      "reference_style": {
        "main_style": "{{art_style}}",
        "tone": "string",
        "line_style": "string"
      }
    }
  ]
}

## Variables
{{story_package_json}}, {{art_style}}
"""
write_prompt("character/character_design.prompt", char_design, "AI漫剧创作专业版提示词.docx + 漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 5. CHARACTER: relationship_network.prompt
# ============================================
rel_net = """## System Prompt
你是擅长人物关系设计的短剧编剧。请根据角色设定，生成清晰的人物关系网络。
你必须输出 JSON。

## User Prompt
输入角色设定：{{characters_json}}
输入故事方案：{{story_package_json}}

要求：
1. 关系要复杂但不能混乱
2. 每个主要角色都要有推动剧情的作用
3. 必须设计隐藏关系或后续反转关系
4. 输出关系揭露时间表
5. 输出能推动剧情的关键关系场景

## Output JSON Schema
{
  "relationship_map_text": "string - 一句话描述整体关系网络",
  "relationships": [
    {
      "from": "string",
      "to": "string",
      "relationship_type": "爱情|仇恨|利用|亲情|竞争|隐藏关系",
      "description": "string",
      "turning_points": ["string"]
    }
  ],
  "hidden_reveals": [
    {
      "episode_no": 1,
      "reveal_content": "string",
      "foreshadowing": "string"
    }
  ]
}

## Variables
{{characters_json}}, {{story_package_json}}
"""
write_prompt("character/relationship_network.prompt", rel_net, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 6. STORYBOARD: storyboard.prompt
# ============================================
storyboard = """## System Prompt
你是专业分镜师，擅长将短剧剧情转化为可执行的 AI 漫剧分镜脚本。
你必须输出 JSON。

## User Prompt
输入：
- 故事方案：{{story_package_json}}
- 角色设定：{{characters_json}}
- 人物关系：{{relationship_json}}
- 当前集数：{{episode_number}}
- 当前集大纲：{{episode_outline}}
- 单集时长：{{episode_duration}}秒
- 目标平台：{{target_platform}}
- 画风：{{art_style}}
- 画面比例：{{aspect_ratio}}

分镜要求：
1. 将剧情分解为 6-8 个镜头；如果是 MVP，可允许 4-6 个镜头
2. 开场 3 秒必须有强冲击，必须让观众停留
3. 结尾必须有悬念钩子
4. 每个镜头时长合理，总时长必须等于 {{episode_duration}} 秒
5. 镜头类型要有变化，特写、中景、全景交替
6. 每个镜头必须包含画面内容、时间、地点、角色、动作、细节、镜头语言、视觉元素、情绪、音效、BGM、台词/旁白、用途
7. 所有画面必须适合 AI 图片生成和图生视频

## Output JSON Schema
{
  "episode": {
    "episode_no": {{episode_number}},
    "title": "string",
    "duration": {{episode_duration}},
    "core_task": "string",
    "emotion_curve": "string"
  },
  "shots": [
    {
      "shot_no": 1,
      "shot_name": "string",
      "start_time": 0,
      "end_time": 8,
      "scene_time": "string",
      "location": "string",
      "characters": ["string"],
      "character_states": "string",
      "action": "string",
      "details": "string",
      "camera": {
        "shot_size": "特写|近景|中景|全景|远景",
        "angle": "平视|俯视|仰视|倾斜",
        "movement": "固定|推进|拉远|跟随|环绕|摇移",
        "depth_of_field": "浅景深|深景深"
      },
      "visual": {
        "lighting": "string",
        "color_tone": "string",
        "vfx": "string",
        "composition": "string"
      },
      "emotion": "string",
      "sfx": "string",
      "bgm": "string",
      "dialogue": "string",
      "purpose": "string",
      "technical_notes": "string"
    }
  ],
  "ending_hook": {
    "visual": "string",
    "line": "string",
    "suspense_question": "string"
  }
}

## Variables
{{story_package_json}}, {{characters_json}}, {{relationship_json}}, {{episode_number}}, {{episode_outline}}, {{episode_duration}}, {{target_platform}}, {{art_style}}, {{aspect_ratio}}
"""
write_prompt("storyboard/storyboard.prompt", storyboard, "AI漫剧创作专业版提示词.docx")
prompt_count[0] += 1

# ============================================
# 7. STORYBOARD: opening_hook.prompt
# ============================================
opening_hook = """## System Prompt
你是短视频爆款导演，擅长设计让用户停留的前 3 秒开场。
你必须输出 JSON。

## User Prompt
输入：
- 当前集剧情：{{episode_outline}}
- 当前分镜：{{storyboard_json}}
- 目标平台：{{target_platform}}
- 目标受众：{{audience}}

请输出 5 种开场钩子方案：冲突式、悬念式、反转式、情感式、问题式。
每种方案必须包含 0-3 秒画面、台词/音效、情绪冲击、适合指数。
最后推荐最适合当前剧情的一种，并说明原因。

## Output JSON Schema
{
  "options": [
    {
      "type": "冲突式|悬念式|反转式|情感式|问题式",
      "opening_visual": "string",
      "line_or_sfx": "string",
      "emotional_impact": "string",
      "score": 5,
      "reason": "string"
    }
  ],
  "recommended": {
    "type": "string",
    "opening_visual": "string",
    "line_or_sfx": "string",
    "reason": "string"
  }
}

## Variables
{{episode_outline}}, {{storyboard_json}}, {{target_platform}}, {{audience}}
"""
write_prompt("storyboard/opening_hook.prompt", opening_hook, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 8. STORYBOARD: ending_hook.prompt
# ============================================
ending_hook = """## System Prompt
你是悬念设计专家，擅长设计让观众必须看下一集的结尾。
你必须输出 JSON。

## User Prompt
输入：
- 当前集内容：{{episode_outline}}
- 下一集内容：{{next_episode_outline}}
- 当前分镜：{{storyboard_json}}

请设计 5 种结尾悬念：反转悬念、危机悬念、身份悬念、情感悬念、问题悬念。
每种方案必须包含最后 5 秒画面、结尾台词、悬念点。

## Output JSON Schema
{
  "options": [
    {
      "type": "反转悬念|危机悬念|身份悬念|情感悬念|问题悬念",
      "final_visual": "string",
      "final_line": "string",
      "suspense_point": "string",
      "score": 5
    }
  ],
  "recommended": {
    "type": "string",
    "final_visual": "string",
    "final_line": "string",
    "reason": "string"
  }
}

## Variables
{{episode_outline}}, {{next_episode_outline}}, {{storyboard_json}}
"""
write_prompt("storyboard/ending_hook.prompt", ending_hook, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 9-15: IMAGE prompts
# ============================================
print("📝 Generating IMAGE prompts...")

image_prompt = """## System Prompt
你是 AI 绘图提示词工程师。请根据分镜脚本和角色设定，为每个镜头生成可直接用于图片生成的 Prompt。
你必须输出 JSON。

## User Prompt
输入：
- 分镜脚本：{{storyboard_json}}
- 角色设定：{{characters_json}}
- 标准角色图信息：{{selected_character_images_json}}
- 画风：{{art_style}}
- 画面比例：{{aspect_ratio}}

要求：
1. 每个镜头输出中文 Prompt 和英文 Prompt
2. Prompt 结构必须包含：画风质量 + 角色描述 + 动作表情 + 服装细节 + 场景环境 + 镜头语言 + 光影氛围
3. 每个包含角色的镜头必须加入角色固定关键词和一致性关键词
4. 输出 Negative Prompt
5. 必须适配 {{aspect_ratio}} 竖屏
6. 不要在画面中生成字幕、文字、水印

## Output JSON Schema
{
  "image_prompts": [
    {
      "shot_no": 1,
      "shot_name": "string",
      "zh_prompt": "string",
      "en_prompt": "string",
      "negative_prompt": "string",
      "consistency_keywords": "string",
      "params": {
        "aspect_ratio": "{{aspect_ratio}}",
        "quality": "high",
        "style": "{{art_style}}",
        "num_outputs": 4
      },
      "reference_character_names": ["string"]
    }
  ]
}

## Variables
{{storyboard_json}}, {{characters_json}}, {{selected_character_images_json}}, {{art_style}}, {{aspect_ratio}}
"""
write_prompt("image/image_prompt.prompt", image_prompt, "AI漫剧创作专业版提示词.docx")
prompt_count[0] += 1

char_visual = """## System Prompt
你是角色外貌视觉设计专家。请为指定角色生成可直接用于 AI 绘图的角色视觉 Prompt。
你必须输出 JSON。

## User Prompt
角色信息：{{characters_json}}
目标角色：{{character}}
画风：{{art_style}}

请生成包含以下元素的 Prompt：
1. 角色全身/半身描述
2. 面部特征细节（眼睛、发型、肤色、五官）
3. 当前服装描述
4. 标志性配饰
5. 姿态和表情
6. 画风修饰词

## Output JSON Schema
{
  "zh_prompt": "string",
  "en_prompt": "string",
  "negative_prompt": "string",
  "style_tags": ["string"],
  "pose_suggestion": "string"
}

## Variables
{{characters_json}}, {{character}}, {{art_style}}
"""
write_prompt("image/character_visual.prompt", char_visual, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

scene_prompt_tmpl = """## System Prompt
你是场景设计师。请为指定场景生成 AI 绘图用场景 Prompt。
你必须输出 JSON。

## User Prompt
场景：{{scene}}
地点：{{location}}
时间：{{scene_time}}
画风：{{art_style}}
氛围：{{emotion}}

## Output JSON Schema
{
  "zh_scene_prompt": "string",
  "en_scene_prompt": "string",
  "lighting_suggestion": "string",
  "color_palette": "string"
}

## Variables
{{scene}}, {{location}}, {{scene_time}}, {{art_style}}, {{emotion}}
"""
write_prompt("image/scene.prompt", scene_prompt_tmpl, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

expression_tmpl = """## System Prompt
你是角色表情与动作设计专家。请为角色生成表情动作 Prompt。
你必须输出 JSON。

## User Prompt
角色：{{character}}
情绪：{{emotion}}
画风：{{art_style}}

## Output JSON Schema
{
  "zh_expression_prompt": "string",
  "en_expression_prompt": "string",
  "action_description": "string",
  "subtle_details": "string"
}

## Variables
{{character}}, {{emotion}}, {{art_style}}
"""
write_prompt("image/expression.prompt", expression_tmpl, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

style_tmpl = """## System Prompt
你是画风控制专家。请为指定画风生成标准化的风格修饰 Prompt。
你必须输出 JSON。

## User Prompt
主画风：{{art_style}}
目标平台：{{target_platform}}
画面比例：{{aspect_ratio}}

## Output JSON Schema
{
  "style_modifier_zh": "string",
  "style_modifier_en": "string",
  "quality_boosts": "8k, high quality, detailed, sharp focus",
  "style_specific_tags": ["string"]
}

## Variables
{{art_style}}, {{target_platform}}, {{aspect_ratio}}
"""
write_prompt("image/style.prompt", style_tmpl, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

camera_tmpl = """## System Prompt
你是镜头语言专家。请为指定镜头生成镜头拍摄描述的 Prompt 片段。
你必须输出 JSON。

## User Prompt
镜头景别：{{shot_size}}
镜头角度：{{camera_angle}}
运镜方式：{{camera_move}}
景深：{{depth_of_field}}

## Output JSON Schema
{
  "zh_camera_prompt": "string",
  "en_camera_prompt": "string",
  "composition_notes": "string"
}

## Variables
{{shot_size}}, {{camera_angle}}, {{camera_move}}, {{depth_of_field}}
"""
write_prompt("image/camera.prompt", camera_tmpl, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

lighting_tmpl = """## System Prompt
你是光影氛围设计专家。请为指定镜头生成光影描述的 Prompt 片段。
你必须输出 JSON。

## User Prompt
场景时间：{{scene_time}}
情绪：{{emotion}}
色调偏好：{{color_tone}}
特殊效果：{{special_effect}}

## Output JSON Schema
{
  "zh_lighting_prompt": "string",
  "en_lighting_prompt": "string",
  "atmosphere_notes": "string"
}

## Variables
{{scene_time}}, {{emotion}}, {{color_tone}}, {{special_effect}}
"""
write_prompt("image/lighting.prompt", lighting_tmpl, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 16-18: VIDEO prompts
# ============================================
print("📝 Generating VIDEO prompts...")

video_prompt = """## System Prompt
你是 AI 视频动态化导演。请根据分镜脚本和最终分镜图，生成图生视频 Prompt。
你必须输出 JSON。

## User Prompt
输入：
- 分镜脚本：{{storyboard_json}}
- 已选分镜图：{{selected_shot_images_json}}
- 单集时长：{{episode_duration}}
- 画面比例：{{aspect_ratio}}

要求：
1. 每个镜头生成一个视频 Prompt
2. Prompt 必须描述镜头运动、角色动作、环境动态、情绪节奏
3. 动作幅度默认 medium，人物特写建议 low，动作/追逐场景可 high
4. 避免角色脸部大幅变化，避免过强运镜
5. 每个片段时长必须等于该镜头 end_time - start_time
6. 如果镜头适合静态轻动效，要明确 slow push in / subtle motion

## Output JSON Schema
{
  "video_prompts": [
    {
      "shot_no": 1,
      "prompt": "string",
      "negative_prompt": "face distortion, identity change, flickering, bad hands, warped body, unstable background, text, watermark",
      "duration": 4,
      "motion_strength": "low|medium|high",
      "camera_motion": "string",
      "character_motion": "string",
      "environment_motion": "string",
      "params": {
        "aspect_ratio": "{{aspect_ratio}}",
        "fps": 24,
        "num_outputs": 2
      }
    }
  ]
}

## Variables
{{storyboard_json}}, {{selected_shot_images_json}}, {{episode_duration}}, {{aspect_ratio}}
"""
write_prompt("video/video_prompt.prompt", video_prompt, "AI漫剧创作专业版提示词.docx")
prompt_count[0] += 1

# Seedance Grid Prompt
seedance = """## System Prompt
你是 Seedance 2.0 视频生成专家。请根据输入生成 9 宫格分镜视频 Prompt。
你必须使用以下结构输出。

## User Prompt
请按以下模板生成 9 宫格剧情流转视频 Prompt：

【环境设定 Context】
场景：{{scene}}
氛围：{{emotion}}
光线：{{lighting}}
色调：{{color_tone}}

【角色设计 Character】
角色：{{character}}
画风：{{art_style}}

【九宫格剧情流转】
第一行：起势与铺垫 (0-5秒)
Panel 1 (远景/开场)：[在此描述]
Panel 2 (推进/特写)：[在此描述]
Panel 3 (对峙/环境)：[在此描述]

第二行：冲突与爆发 (5-10秒)
Panel 4 (动作/交锋)：[在此描述]
Panel 5 (特效/高潮)：[在此描述]
Panel 6 (反应/破坏)：[在此描述]

第三行：结果与余韵 (10-15秒)
Panel 7 (宏大/全景)：[在此描述]
Panel 8 (细节/局部)：[在此描述]
Panel 9 (收尾/定格)：[在此描述]

【风格修饰词】
Volumetric lighting, Ray tracing, Particle effects, Bloom effect,
Hyper-realistic textures, Dynamic angle, Film grain, Cinematic composition, --ar 16:9

## Variables
{{scene}}, {{emotion}}, {{lighting}}, {{color_tone}}, {{character}}, {{art_style}}
"""
write_prompt("video/seedance_storyboard_grid.prompt", seedance, "seedance2.0分镜提示词模板.txt")
prompt_count[0] += 1

# Three Act Video Motion
three_act = """## System Prompt
你是视频动态化导演。请使用三段式结构生成图生视频运镜 Prompt。

## User Prompt
15秒视频；运镜风格：平滑跟随 / 动态推拉 / 环绕；整体节奏：静 -> 动 -> 静。

【主体与风格锚点】
角色外观：{{character}}，画风：{{art_style}}
关键词：高清晰度、电影质感、细节丰富

【场景与环境】
环境：{{scene}}
天气与光影：{{lighting}} / {{color_tone}}

【运镜与节奏】
15秒；运镜风格根据内容选择；整体节奏：静 -> 动 -> 静。

【动态分镜脚本】
0-5s [开场/平静]：角色初始状态，环境氛围铺垫，运镜缓慢推进。
5-10s [高潮/爆发]：核心动作展示，强调情绪爆发的撕裂感。
10-15s [收尾/定格]：动作结束后的余韵，画面拉近展示面部情绪，稳定定格构图。

【负面描述】
画面模糊、人物变形、肢体扭曲、多余的手指、文字水印、低质量特效。

## Variables
{{character}}, {{art_style}}, {{scene}}, {{lighting}}, {{color_tone}}, {{special_effect}}
"""
write_prompt("video/three_act_video_motion.prompt", three_act, "Seedance 2.0智能体模板.txt")
prompt_count[0] += 1

# ============================================
# 19: AUDIO: voice_script.prompt
# ============================================
print("📝 Generating AUDIO prompts...")

voice_script = """## System Prompt
你是短视频漫剧配音和字幕编导。请根据分镜脚本生成完整配音文案、字幕时间轴、音效和 BGM 建议。
你必须输出 JSON。

## User Prompt
输入：
- 分镜脚本：{{storyboard_json}}
- 角色设定：{{characters_json}}
- 目标平台：{{target_platform}}

要求：
1. 所有台词要口语化、短句、有情绪
2. 每句台词必须标注开始时间、结束时间、说话者、情绪
3. 输出旁白、角色台词、音效、BGM 建议
4. 生成 SRT 字幕内容
5. 结尾必须有悬念字幕和下集预告

## Output JSON Schema
{
  "voice_timeline": [
    {
      "start": "00:00.000",
      "end": "00:05.000",
      "type": "narration|dialogue|sfx|bgm|subtitle",
      "speaker": "string",
      "text": "string",
      "emotion": "string",
      "volume_suggestion": "low|medium|high"
    }
  ],
  "srt": "string - full SRT format content",
  "bgm_suggestions": [
    {
      "time_range": "string",
      "style": "string",
      "emotion": "string",
      "volume": "low|medium|high"
    }
  ],
  "sfx_suggestions": [
    {
      "time": "string",
      "sfx": "string",
      "purpose": "string"
    }
  ],
  "ending_subtitle": "string",
  "next_episode_teaser": "string"
}

## Variables
{{storyboard_json}}, {{characters_json}}, {{target_platform}}
"""
write_prompt("audio/voice_script.prompt", voice_script, "AI漫剧创作专业版提示词.docx + 漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 20-21: PLATFORM prompts
# ============================================
platform_opt = """## System Prompt
你是短视频运营专家。请根据当前集内容生成抖音、快手、视频号三个平台的发布方案。
你必须输出 JSON。

## User Prompt
输入：
- 故事方案：{{story_package_json}}
- 当前集分镜：{{storyboard_json}}
- 目标平台：{{target_platform}}
- 角色设定：{{characters_json}}

要求：
1. 抖音版本突出前 3 秒钩子、强冲突、热门话题、互动问题
2. 快手版本更接地气，标题更直接，情绪更强
3. 视频号版本表达更完整，适当加入价值导向和分享引导
4. 输出标题、简介、话题标签、封面文案、评论区引导问题

## Output JSON Schema
{
  "douyin": {
    "title": "string",
    "description": "string",
    "hashtags": ["string"],
    "cover_text": "string",
    "comment_question": "string",
    "subtitle_style": "string"
  },
  "kuaishou": {
    "title": "string",
    "description": "string",
    "hashtags": ["string"],
    "cover_text": "string",
    "comment_question": "string"
  },
  "shipinhao": {
    "title": "string",
    "description": "string",
    "hashtags": ["string"],
    "cover_text": "string",
    "share_prompt": "string",
    "value_angle": "string"
  }
}

## Variables
{{story_package_json}}, {{storyboard_json}}, {{target_platform}}, {{characters_json}}
"""
write_prompt("platform/platform_optimization.prompt", platform_opt, "AI漫剧创作专业版提示词.docx")
prompt_count[0] += 1

title_copy = """## System Prompt
你是短视频漫剧标题和文案设计专家。请生成吸引人的标题和封面文案。
你必须输出 JSON。

## User Prompt
输入：
- 当前集剧情：{{episode_outline}}
- 目标平台：{{target_platform}}
- 核心卖点：{{selling_points}}

请生成 5 个备选标题，每个突出不同卖点。

## Output JSON Schema
{
  "titles": [
    {
      "title": "string",
      "style": "悬念型|冲突型|情感型|反转型|问题型",
      "score": 5,
      "reason": "string"
    }
  ],
  "recommended": {"title": "string", "reason": "string"},
  "cover_text": "string",
  "description": "string"
}

## Variables
{{episode_outline}}, {{target_platform}}, {{selling_points}}
"""
write_prompt("platform/title_copy.prompt", title_copy, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# 22-24: QC prompts
# ============================================
print("📝 Generating QC prompts...")

text_qc = """## System Prompt
你是 AI 漫剧质检专家。请检查输入内容是否适合短视频漫剧生产。
你必须输出 JSON。

## User Prompt
输入内容类型：{{content_type}}
输入内容：{{content_json}}

检查维度：
1. 是否有强冲突
2. 前 3 秒是否足够吸引人
3. 结尾是否有悬念
4. 角色是否有视觉辨识度
5. 角色描述是否足够稳定，可用于多镜头一致性
6. 分镜是否可视化，是否适合 AI 绘图
7. 台词是否口语化
8. Prompt 是否包含画风、角色、动作、场景、镜头、光影、参数
9. 是否存在逻辑漏洞或执行难度过高的镜头

## Output JSON Schema
{
  "score": 85,
  "passed": true,
  "issues": [
    {
      "level": "high|medium|low",
      "field": "string",
      "problem": "string",
      "suggestion": "string"
    }
  ],
  "rewrite_required": false,
  "rewrite_instruction": "string"
}

## Variables
{{content_type}}, {{content_json}}
"""
write_prompt("qc/text_qc.prompt", text_qc, "AI漫剧创作专业版提示词.docx")
prompt_count[0] += 1

image_qc = """## System Prompt
你是 AI 漫剧图片质检专家。请检查图片生成结果。
你必须输出 JSON。

## User Prompt
请检查以下图片：
- 是否生成成功
- 是否有图片 URL
- 是否缺图
- 是否命名正确
- 是否关联项目/角色/镜头
- 是否有明显的水印、文字、畸形、崩坏

## Output JSON Schema
{
  "score": 85,
  "passed": true,
  "image_count": 4,
  "issues": [
    {
      "image_index": 1,
      "level": "high|medium|low",
      "problem": "string",
      "action": "regenerate|accept|edit_prompt"
    }
  ]
}

## Variables
{{content_type}}, {{content_json}}
"""
write_prompt("qc/image_qc.prompt", image_qc, "AI漫剧创作专业版提示词.docx")
prompt_count[0] += 1

video_qc_tmpl = """## System Prompt
你是 AI 漫剧视频质检专家。请检查视频生成结果。
你必须输出 JSON。

## User Prompt
请检查以下视频：
- 是否生成成功
- 是否有视频 URL
- 是否有时长
- 是否关联镜头
- 是否可播放
- 是否有明显的变形、闪烁、人物崩坏

## Output JSON Schema
{
  "score": 85,
  "passed": true,
  "video_count": 2,
  "issues": [
    {
      "video_index": 1,
      "level": "high|medium|low",
      "problem": "string",
      "action": "regenerate|accept"
    }
  ]
}

## Variables
{{content_type}}, {{content_json}}
"""
write_prompt("qc/video_qc.prompt", video_qc_tmpl, "AI漫剧创作专业版提示词.docx")
prompt_count[0] += 1

# ============================================
# 25: story/novel_adaptation.prompt
# ============================================
novel_adapt = """## System Prompt
你是专业小说改编漫剧编剧。请将输入的小说/故事文本改编为适合短视频漫剧的方案。
你必须输出 JSON。

## User Prompt
输入小说/故事文本：{{full_story}}
目标平台：{{target_platform}}
预计集数：{{episode_count}}
单集时长：{{episode_duration}}秒

改编要求：
1. 提取核心人物关系
2. 识别关键冲突节点
3. 将长文本浓缩为分集大纲
4. 保留原作核心卖点
5. 删除不适合视觉呈现的心理描写和抽象内容
6. 增强视觉冲击力和节奏感

## Output JSON Schema
{
  "adaptation_summary": "string",
  "key_characters": [
    {
      "name": "string",
      "role": "string",
      "adapted_traits": "string"
    }
  ],
  "episode_outline": [
    {
      "episode_no": 1,
      "title": "string",
      "source_chapters": "string",
      "core_plot": "string",
      "adaptation_notes": "string"
    }
  ]
}

## Variables
{{full_story}}, {{target_platform}}, {{episode_count}}, {{episode_duration}}
"""
write_prompt("story/novel_adaptation.prompt", novel_adapt, "漫剧提示词创作合集.doc")
prompt_count[0] += 1

# ============================================
# JSON 素材库生成
# ============================================
print("\n📊 Generating JSON material libraries...")

# 1. Cinematic Style Library (from CSV)
if csv_data and csv_data.get("rows"):
    entries = []
    for row in csv_data["rows"]:
        if len(row) >= 2:
            entries.append({
                "category": row[0].strip(),
                "prompt": row[1].strip(),
                "source": "300+电影风格提示词.csv"
            })
    write_json_lib("style/cinematic_style_library.json", entries, "300+电影风格提示词.csv")
    json_count[0] += 1
    
    # Also split into sub-categories for image modifiers
    image_modifiers = []
    for row in csv_data["rows"]:
        if len(row) >= 2:
            cat = row[0].strip()
            prompt = row[1].strip()
            if cat in ["影视风格", "灯光色调", "摄影手法"]:
                image_modifiers.append({"category": cat, "modifier": prompt})
    write_json_lib("image/cinematic_style_modifiers.json", image_modifiers, "300+电影风格提示词.csv")
    json_count[0] += 1

# 2. Camera Knowledge Base (from 运镜教学.doc)
if "doc_运镜教学.txt" in doc_texts:
    camera_kb = []
    lines = doc_texts["doc_运镜教学.txt"].strip().split('\n')
    current_term = None
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if any(kw in line for kw in ['镜头', '视角', '光线', '运镜', '景别', '角度', '广角', '长焦', '变焦', '定焦', '鱼眼', '固定', '手持', '平视', '仰视', '俯视', '倾斜', '背对', '主观', '正面光', '侧面光', '逆光', '底光', '推', '拉', '摇', '移', '升', '降', '远景', '全景', '中景', '特写']):
            if len(line) < 30:
                current_term = line
            else:
                camera_kb.append({"term": current_term or line[:20], "definition": line, "source": "运镜教学.doc"})
                current_term = None
        elif current_term:
            camera_kb.append({"term": current_term, "definition": line, "source": "运镜教学.doc"})
            current_term = None
    write_json_lib("camera/camera_knowledge_base.json", camera_kb, "运镜教学.doc")
    json_count[0] += 1


def classify_camera_term(term):
    if any(k in term for k in ["镜头", "广角", "长焦", "变焦", "定焦", "鱼眼"]): return "lens_type"
    if any(k in term for k in ["平视", "仰视", "俯视", "倾斜", "背对", "主观"]): return "camera_angle"
    if any(k in term for k in ["光", "正面", "侧面", "逆光"]): return "lighting"
    if any(k in term for k in ["推", "拉", "摇", "移", "升", "降"]): return "camera_movement"
    if any(k in term for k in ["远景", "全景", "中景", "特写", "近景"]): return "shot_size"
    return "general"

# 3. Camera Terms
    camera_terms = []
    for entry in camera_kb:
        term = entry.get("term", "")
        if term:
            camera_terms.append({"term_zh": term, "category": classify_camera_term(term), "definition": entry.get("definition", "")})
    write_json_lib("camera/camera_terms.json", camera_terms, "运镜教学.doc")
    json_count[0] += 1

def _classify_camera_term(term):
    if any(k in term for k in ['镜头', '广角', '长焦', '变焦', '定焦', '鱼眼']): return "lens_type"
    if any(k in term for k in ['平视', '仰视', '俯视', '倾斜', '背对', '主观']): return "camera_angle"
    if any(k in term for k in ['光', '正面', '侧面', '逆光']): return "lighting"
    if any(k in term for k in ['推', '拉', '摇', '移', '升', '降']): return "camera_movement"
    if any(k in term for k in ['远景', '全景', '中景', '特写', '近景']): return "shot_size"
    return "general"

# 4. Classic Camera Moves (from 十大经典运镜教程.docx)
classic_moves = []
for item in docx_data:
    if item.get("file") == "十大经典运镜教程.docx" and item.get("status") == "OK":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 10:
                classic_moves.append({"text": text, "source": "十大经典运镜教程.docx"})
write_json_lib("camera/classic_camera_moves.json", classic_moves, "十大经典运镜教程.docx")
json_count[0] += 1

# 5. Shot Visual Library (from 【先看这个】分镜画面提示词.xlsx)
for item in xlsx_data:
    if item.get("file") == "【先看这个】分镜画面提示词.xlsx":
        entries = []
        for sheet_name, sheet_data in item.get("data", {}).items():
            for row in sheet_data.get("rows", [])[:50]:  # first 50 for sampling
                entries.append(row)
        write_json_lib("storyboard/shot_visual_library.json", entries, "【先看这个】分镜画面提示词.xlsx")
        json_count[0] += 1
        write_json_lib("image/shot_image_prompt_library.json", entries, "【先看这个】分镜画面提示词.xlsx")
        json_count[0] += 1

# 6. Video Storyboard Templates (from AI视频脚本分镜模板_共300条.xlsx)
for item in xlsx_data:
    if item.get("file") == "AI视频脚本分镜模板_共300条.xlsx":
        entries = []
        for sheet_name, sheet_data in item.get("data", {}).items():
            for row in sheet_data.get("rows", []):
                entries.append(row)
        write_json_lib("storyboard/video_storyboard_templates.json", entries, "AI视频脚本分镜模板_共300条.xlsx")
        json_count[0] += 1
        write_json_lib("video/video_script_templates.json", entries, "AI视频脚本分镜模板_共300条.xlsx")
        json_count[0] += 1

# 7. Jimeng Libraries (from 即梦100多组神级指令合集.xlsx)
for item in xlsx_data:
    if item.get("file") == "即梦100多组神级指令合集.xlsx":
        image_entries = []
        video_entries = []
        for sheet_name, sheet_data in item.get("data", {}).items():
            for row in sheet_data.get("rows", []):
                if "图" in sheet_name or "image" in sheet_name.lower():
                    image_entries.append(row)
                else:
                    video_entries.append(row)
        write_json_lib("image/jimeng_image_prompt_library.json", image_entries, "即梦100多组神级指令合集.xlsx")
        json_count[0] += 1
        write_json_lib("video/jimeng_video_prompt_library.json", video_entries, "即梦100多组神级指令合集.xlsx")
        json_count[0] += 1

# 8. Motion Libraries (from various sources)
effect_motions = []
for item in docx_data:
    if item.get("file") == "特效运镜.docx":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 5:
                effect_motions.append({"description": text, "source": "特效运镜.docx"})
write_json_lib("video/effect_motion_templates.json", effect_motions, "特效运镜.docx")
json_count[0] += 1

# 9. Cinematic Motion Combos (from 12组电影级组合运镜提示词.docx)
cinematic_combos = []
for item in docx_data:
    if item.get("file") == "12组电影级组合运镜提示词.docx":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 10:
                cinematic_combos.append({"text": text, "source": "12组电影级组合运镜提示词.docx"})
write_json_lib("video/cinematic_motion_combos.json", cinematic_combos, "12组电影级组合运镜提示词.docx")
json_count[0] += 1
write_json_lib("image/cinematic_frame_combos.json", cinematic_combos, "12组电影级组合运镜提示词.docx")
json_count[0] += 1

# 10. Image-to-Video Motion Pairs (from 组合运镜.docx)
motion_pairs = []
for item in docx_data:
    if item.get("file") == "组合运镜.docx":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 10:
                motion_pairs.append({"text": text, "source": "组合运镜.docx"})
write_json_lib("video/image_to_video_motion_pairs.json", motion_pairs, "组合运镜.docx")
json_count[0] += 1

# 11. Advanced Motion Combos (from 组合运镜2.docx)
advanced_combos = []
for item in docx_data:
    if item.get("file") == "组合运镜2.docx":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 10:
                advanced_combos.append({"text": text, "source": "组合运镜2.docx"})
write_json_lib("video/advanced_motion_combos.json", advanced_combos, "组合运镜2.docx")
json_count[0] += 1

# 12. Cinematic Scene Patterns (from 组合运镜2.docx)
scene_patterns = []
for item in docx_data:
    if item.get("file") == "组合运镜2.docx":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 15:
                scene_patterns.append({"text": text, "source": "组合运镜2.docx"})
write_json_lib("storyboard/cinematic_scene_patterns.json", scene_patterns, "组合运镜2.docx")
json_count[0] += 1

# 13. Special Effect Camera (from 特效运镜.docx)
special_effect_camera = []
for item in docx_data:
    if item.get("file") == "特效运镜.docx":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 10:
                special_effect_camera.append({"text": text, "source": "特效运镜.docx"})
write_json_lib("camera/special_effect_camera.json", special_effect_camera, "特效运镜.docx")
json_count[0] += 1

# 14. Classic Motion Templates (from 十大经典运镜教程.docx)
classic_motion = []
for item in docx_data:
    if item.get("file") == "十大经典运镜教程.docx":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 10:
                classic_motion.append({"text": text, "source": "十大经典运镜教程.docx"})
write_json_lib("video/classic_motion_templates.json", classic_motion, "十大经典运镜教程.docx")
json_count[0] += 1

# 15. Motion Prompt Library (from 运镜提示词.doc)
motion_lib = []
if "doc_运镜提示词.txt" in doc_texts:
    lines = doc_texts["doc_运镜提示词.txt"].strip().split('\n')
    for line in lines:
        line = line.strip()
        if len(line) > 5:
            motion_lib.append({"text": line, "source": "运镜提示词.doc"})
write_json_lib("video/motion_prompt_library.json", motion_lib, "运镜提示词.doc")
json_count[0] += 1

# 16. Motion Prompt Categories (from 运镜提示词.doc)
write_json_lib("camera/motion_prompt_categories.json", motion_lib, "运镜提示词.doc")
json_count[0] += 1

# 17. Manjv Motion Templates (from AI漫剧16个运镜提示词模板.docx)
manjv_motion = []
for item in docx_data:
    if item.get("file") == "AI漫剧16个运镜提示词模板.docx":
        for para in item.get("paragraphs", []):
            text = para["text"]
            if len(text) > 10:
                manjv_motion.append({"text": text, "source": "AI漫剧16个运镜提示词模板.docx"})
write_json_lib("video/manjv_motion_templates.json", manjv_motion, "AI漫剧16个运镜提示词模板.docx")
json_count[0] += 1

# 18. Character Genre Mapping (from 15种ai漫剧题材的人物提示词案例.xlsx)
for item in xlsx_data:
    if item.get("file") == "15种ai漫剧题材的人物提示词案例.xlsx":
        entries = []
        for sheet_name, sheet_data in item.get("data", {}).items():
            for row in sheet_data.get("rows", []):
                entries.append(row)
        write_json_lib("character/genre_character_mapping.json", entries, "15种ai漫剧题材的人物提示词案例.xlsx")
        json_count[0] += 1

# 19. Character Prompt Formula (from AI生成人物角色提示词通用公式表格模板.xlsx)
for item in xlsx_data:
    if item.get("file") == "AI生成人物角色提示词通用公式表格模板.xlsx":
        entries = []
        for sheet_name, sheet_data in item.get("data", {}).items():
            for row in sheet_data.get("rows", []):
                entries.append(row)
        write_json_lib("character/character_prompt_formula.json", entries, "AI生成人物角色提示词通用公式表格模板.xlsx")
        json_count[0] += 1

# ============================================
# Save SOP reference doc
# ============================================
print("\n📝 Generating SOP reference...")
pdf_data = load_json("pdf_parsed.json")
if pdf_data and pdf_data.get("full_text"):
    sop_path = f"{BASE}/docs/sop_reference.md"
    with open(sop_path, 'w', encoding='utf-8') as f:
        f.write("# AI 漫剧创作完整 SOP 参考\n\n")
        f.write("> 来源：AI漫剧创作完整指南（专业增强版）.pdf\n\n")
        f.write(pdf_data["full_text"])
    print(f"  ✅ docs/sop_reference.md ({len(pdf_data['full_text'])} chars)")

# ============================================
# Summary
# ============================================
print(f"\n{'='*60}")
print(f"✅ Phase 2 文件生成完成!")
print(f"   .prompt 文件: {prompt_count[0]} 个")
print(f"   .json 素材库: {json_count[0]} 个")
print(f"   SOP 文档: 1 个")
print(f"{'='*60}")
