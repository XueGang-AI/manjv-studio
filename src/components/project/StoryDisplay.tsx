'use client'

import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Target, AlertCircle, Film } from 'lucide-react'

interface StoryData {
  basic_info?: {
    genre?: string
    background?: string
    core_conflict?: string
    emotional_tone?: string
    target_audience?: string
    platform?: string
  }
  selling_points?: string[]
  core_characters?: Array<{
    name: string
    role_type: string
    brief_identity: string
    story_function: string
  }>
  highlight_scenes?: Array<{
    scene_name: string
    visual_description?: string
    description?: string
    emotional_impact?: string
    emotion?: string
    story_value?: string
    visual_value?: string
  }>
  episode_outline?: Array<{
    episode_no: number
    title: string
    core_plot: string
    hook: string
    emotion: string
    duration: number
  }>
  platform_suggestion?: {
    opening_strategy?: string
    opening_hook?: string
    subtitle_style?: string
    title_direction?: string
    interaction_question?: string
    interaction_prompt?: string
    tags?: string[]
  }
}

interface Props {
  story: StoryData
  version?: number
  confirmed?: boolean
}

export function StoryDisplay({ story, version, confirmed }: Props) {
  if (!story || Object.keys(story).length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* 版本信息 */}
      {version && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">版本 v{version}</span>
          {confirmed && <Badge variant="success">已确认</Badge>}
        </div>
      )}

      {/* 基础信息 */}
      {story.basic_info && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target size={18} className="text-indigo-500" />
              基础信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              {story.basic_info.genre && (
                <Field label="题材类型" value={story.basic_info.genre} />
              )}
              {story.basic_info.background && (
                <Field label="时代背景" value={story.basic_info.background} />
              )}
              {story.basic_info.core_conflict && (
                <div className="col-span-2">
                  <Field label="核心冲突" value={story.basic_info.core_conflict} />
                </div>
              )}
              {story.basic_info.emotional_tone && (
                <Field label="情感基调" value={story.basic_info.emotional_tone} />
              )}
              {story.basic_info.target_audience && (
                <Field label="目标受众" value={story.basic_info.target_audience} />
              )}
              {story.basic_info.platform && (
                <Field label="发布平台" value={story.basic_info.platform} />
              )}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* 核心卖点 */}
      {story.selling_points && story.selling_points.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              核心卖点
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {story.selling_points.map((point, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-gray-700">{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 核心角色 */}
      {story.core_characters && story.core_characters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>核心角色</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {story.core_characters.map((char, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{char.name}</span>
                    <Badge variant={char.role_type === '反派' ? 'danger' : 'info'} className="text-xs">
                      {char.role_type || '未知'}
                    </Badge>
                  </div>
                  {char.brief_identity && (
                    <p className="text-xs text-gray-500">{char.brief_identity}</p>
                  )}
                  {char.story_function && (
                    <p className="text-xs text-gray-400 mt-1">{char.story_function}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 爆点场景 */}
      {story.highlight_scenes && story.highlight_scenes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle size={18} className="text-red-500" />
              爆点场景
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {story.highlight_scenes.map((scene, i) => (
                <div key={i} className="border-l-4 border-red-400 pl-4">
                  <h4 className="font-medium text-sm">{scene.scene_name}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {scene.visual_description || scene.description}
                  </p>
                  <div className="flex gap-3 mt-1">
                    {(scene.emotional_impact || scene.emotion) && (
                      <span className="text-xs text-gray-400">
                        🎭 {scene.emotional_impact || scene.emotion}
                      </span>
                    )}
                    {(scene.story_value || scene.visual_value) && (
                      <span className="text-xs text-gray-400">
                        💡 {scene.story_value || scene.visual_value}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 分集大纲 */}
      {story.episode_outline && story.episode_outline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Film size={18} className="text-blue-500" />
              分集大纲
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {story.episode_outline.map((ep) => (
                <div key={ep.episode_no} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">
                      第 {ep.episode_no} 集：{ep.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {ep.emotion && <Badge>{ep.emotion}</Badge>}
                      <span>{ep.duration || 90}s</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{ep.core_plot}</p>
                  {ep.hook && (
                    <p className="text-xs text-indigo-600 mt-2 flex items-center gap-1">
                      <span>🎣</span> 结尾钩子：{ep.hook}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 平台建议 */}
      {story.platform_suggestion && (
        <Card>
          <CardHeader>
            <CardTitle>平台优化建议</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3">
              {(story.platform_suggestion.opening_strategy || story.platform_suggestion.opening_hook) && (
                <Field label="开场策略" value={
                  story.platform_suggestion.opening_strategy || story.platform_suggestion.opening_hook || ''
                } />
              )}
              {story.platform_suggestion.subtitle_style && (
                <Field label="字幕风格" value={story.platform_suggestion.subtitle_style} />
              )}
              {(story.platform_suggestion.interaction_question || story.platform_suggestion.interaction_prompt) && (
                <Field label="互动引导" value={
                  story.platform_suggestion.interaction_question || story.platform_suggestion.interaction_prompt || ''
                } />
              )}
              {story.platform_suggestion.tags && story.platform_suggestion.tags.length > 0 && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">推荐标签</dt>
                  <dd className="flex flex-wrap gap-1">
                    {story.platform_suggestion.tags.map((tag, i) => (
                      <Badge key={i}>{tag}</Badge>
                    ))}
                  </dd>
                </div>
              )}
              {story.platform_suggestion.title_direction && (
                <Field label="标题方向" value={story.platform_suggestion.title_direction} />
              )}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '-'}</dd>
    </div>
  )
}
