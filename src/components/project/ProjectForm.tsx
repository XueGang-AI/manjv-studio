'use client'

import React, { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Plus } from 'lucide-react'
import { ValidationError } from '@/lib/validators'

const STORY_TYPES = ['霸总', '古风', '现代', '悬疑', '玄幻', '甜宠', '都市', '职场', '自定义']
const ART_STYLES = ['韩漫', '日漫', '国风', '写实', '赛博朋克', '电影感', '自定义']
const PLATFORMS = ['抖音', '快手', '视频号', '小红书', 'B站', '自定义']
const DURATIONS = [60, 90, 120, 180]
const ASPECT_RATIOS = ['9:16', '16:9', '1:1']

export interface ProjectFormData {
  project_name: string
  story_type: string
  background: string
  main_characters: string[]
  core_conflict: string
  story_summary: string
  full_story: string
  art_style: string
  target_platform: string
  episode_count: number
  episode_duration: number
  aspect_ratio: string
}

interface Props {
  initialData?: Partial<ProjectFormData>
  onSubmit: (data: ProjectFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  loading?: boolean
  errors?: ValidationError[]
}

const defaultForm: ProjectFormData = {
  project_name: '',
  story_type: '',
  background: '',
  main_characters: [''],
  core_conflict: '',
  story_summary: '',
  full_story: '',
  art_style: '',
  target_platform: '',
  episode_count: 10,
  episode_duration: 90,
  aspect_ratio: '9:16',
}

export function ProjectForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = '创建项目',
  loading: externalLoading,
  errors: externalErrors,
}: Props) {
  const [form, setForm] = useState<ProjectFormData>({ ...defaultForm, ...initialData })
  const [internalLoading, setInternalLoading] = useState(false)
  const [localErrors, setLocalErrors] = useState<string[]>([])

  const loading = externalLoading ?? internalLoading
  const displayErrors = externalErrors?.map(e => `${e.field}: ${e.message}`) || localErrors

  const updateField = <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setLocalErrors([])
  }

  const addCharacter = () => {
    setForm(prev => ({
      ...prev,
      main_characters: [...prev.main_characters, ''],
    }))
  }

  const removeCharacter = (index: number) => {
    setForm(prev => {
      const chars = prev.main_characters.filter((_, i) => i !== index)
      return { ...prev, main_characters: chars.length === 0 ? [''] : chars }
    })
  }

  const updateCharacter = (index: number, value: string) => {
    setForm(prev => {
      const chars = [...prev.main_characters]
      chars[index] = value
      return { ...prev, main_characters: chars }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalErrors([])
    setInternalLoading(true)

    // 清理空角色
    const cleaned = {
      ...form,
      main_characters: form.main_characters.filter(c => c.trim()),
    }

    if (cleaned.main_characters.length === 0) {
      setLocalErrors(['至少需要 1 个主要角色'])
      setInternalLoading(false)
      return
    }

    try {
      await onSubmit(cleaned)
    } catch (err) {
      setLocalErrors([(err as Error).message || '提交失败'])
    } finally {
      setInternalLoading(false)
    }
  }

  const OptionGroup = ({
    label,
    options,
    value,
    field,
  }: {
    label: string
    options: string[]
    value: string
    field: keyof ProjectFormData
  }) => (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => updateField(field, opt)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              value === opt
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {/* 错误提示 */}
      {displayErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
            {displayErrors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            基本信息
            <span className="text-xs text-red-500 font-normal">* 必填</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              项目名称 <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={form.project_name}
              onChange={e => updateField('project_name', e.target.value)}
              placeholder="例如：雨夜重生"
              maxLength={50}
            />
            <p className="text-xs text-gray-400 mt-0.5">{form.project_name.length}/50</p>
          </div>

          <OptionGroup label="故事类型 *" options={STORY_TYPES} value={form.story_type} field="story_type" />

          <div>
            <label className="block text-sm font-medium mb-1">
              故事背景 <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={form.background}
              onChange={e => updateField('background', e.target.value)}
              placeholder="例如：现代都市，珠宝设计行业"
            />
          </div>

          {/* 主要角色 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              主要角色 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {form.main_characters.map((char, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={char}
                    onChange={e => updateCharacter(i, e.target.value)}
                    placeholder={`角色 ${i + 1}`}
                  />
                  {form.main_characters.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCharacter(i)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addCharacter}
              className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <Plus size={14} /> 添加角色
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              核心冲突 <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={form.core_conflict}
              onChange={e => updateField('core_conflict', e.target.value)}
              placeholder="例如：爱情与复仇的对立"
              maxLength={300}
            />
            <p className="text-xs text-gray-400 mt-0.5">{form.core_conflict.length}/300</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              故事梗概 <span className="text-red-500">*</span>
              <span className="text-xs text-gray-400 ml-1">至少 20 字</span>
            </label>
            <textarea
              required
              rows={5}
              value={form.story_summary}
              onChange={e => updateField('story_summary', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
              placeholder="简要描述你的故事脉络和主要情节..."
              maxLength={2000}
            />
            <p className="text-xs text-gray-400 mt-0.5">{form.story_summary.length}/2000</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              完整故事 <span className="text-xs text-gray-400 ml-1">可选</span>
            </label>
            <textarea
              rows={8}
              value={form.full_story}
              onChange={e => updateField('full_story', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
              placeholder="如果有完整故事文本，可以粘贴到这里..."
            />
          </div>
        </CardContent>
      </Card>

      {/* 风格与平台 */}
      <Card>
        <CardHeader>
          <CardTitle>风格与平台</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <OptionGroup label="期望画风 *" options={ART_STYLES} value={form.art_style} field="art_style" />
          <OptionGroup label="目标平台 *" options={PLATFORMS} value={form.target_platform} field="target_platform" />

          <div>
            <label className="block text-sm font-medium mb-1.5">画面比例 *</label>
            <div className="flex gap-2">
              {ASPECT_RATIOS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => updateField('aspect_ratio', r)}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    form.aspect_ratio === r
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">预计集数 *</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.episode_count}
                onChange={e => updateField('episode_count', parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">单集时长（秒）*</label>
              <div className="flex gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => updateField('episode_duration', d)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      form.episode_duration === d
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              提交中...
            </span>
          ) : submitLabel}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={loading}>
          取消
        </Button>
      </div>
    </form>
  )
}
