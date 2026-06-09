'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

const PROMPT_CATEGORIES = [
  { name: 'story', label: '故事创作', files: ['story_analysis.prompt', 'story_creation.prompt', 'novel_adaptation.prompt', 'plot_optimization.prompt'], phase: 'Phase 2' },
  { name: 'character', label: '角色设计', files: ['character_design.prompt', 'relationship_network.prompt'], phase: 'Phase 2' },
  { name: 'storyboard', label: '分镜脚本', files: ['storyboard.prompt', 'opening_hook.prompt', 'ending_hook.prompt', 'shot_visual_library.json', 'video_storyboard_templates.json'], phase: 'Phase 2' },
  { name: 'image', label: '图片 Prompt', files: ['image_prompt.prompt', 'character_visual.prompt', 'scene.prompt', 'style.prompt', 'lighting.prompt', 'cinematic_frame_combos.json'], phase: 'Phase 2' },
  { name: 'video', label: '视频 Prompt', files: ['video_prompt.prompt', 'seedance_storyboard_grid.prompt', 'three_act_video_motion.prompt', 'cinematic_motion_combos.json'], phase: 'Phase 2' },
  { name: 'camera', label: '镜头与运镜', files: ['camera_knowledge_base.json', 'camera_terms.json', 'classic_camera_moves.json', 'motion_prompt_categories.json'], phase: 'Phase 2' },
  { name: 'style', label: '电影风格', files: ['cinematic_style_library.json'], phase: 'Phase 2' },
  { name: 'audio', label: '配音字幕', files: ['voice_script.prompt'], phase: 'Phase 2' },
  { name: 'platform', label: '平台文案', files: ['platform_optimization.prompt', 'title_copy.prompt'], phase: 'Phase 2' },
  { name: 'qc', label: '质量检查', files: ['text_qc.prompt', 'image_qc.prompt', 'video_qc.prompt'], phase: 'Phase 2' },
]

export default function PromptsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Prompt 模板库</h1>
      <p className="text-gray-500 mb-6">
        管理 AI 漫剧创作的所有 Prompt 模板。此页面将在 Phase 2 完善，届时会解析 17 个专业文件并填充模板。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PROMPT_CATEGORIES.map((cat) => (
          <Card key={cat.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {cat.label}
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{cat.phase}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {cat.files.map((file) => (
                  <li key={file} className="text-xs text-gray-400 font-mono">
                    {file}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
