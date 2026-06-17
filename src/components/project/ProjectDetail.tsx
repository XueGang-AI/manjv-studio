'use client'

import React from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProjectStatusBadge } from './ProjectStatusBadge'
import { Edit3, ArrowRight } from 'lucide-react'

interface ProjectData {
  id: string
  projectName: string
  storyType: string | null
  background: string | null
  mainCharacters: string[] | null
  coreConflict: string | null
  storySummary: string | null
  fullStory: string | null
  artStyle: string | null
  targetPlatform: string | null
  episodeCount: number
  episodeDuration: number
  aspectRatio: string
  status: string
  createdAt: string
  updatedAt: string
}

interface Props {
  project: ProjectData
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{label}</dt>
      <dd className={`text-sm text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {value || <span className="text-gray-300">未设置</span>}
      </dd>
    </div>
  )
}

export function ProjectDetail({ project }: Props) {
  const characters: string[] = Array.isArray(project.mainCharacters)
    ? project.mainCharacters.filter(Boolean)
    : []

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 头部信息 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.projectName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <ProjectStatusBadge status={project.status} />
            {project.storyType && (
              <span className="text-sm text-gray-500">{project.storyType}</span>
            )}
            <span className="text-sm text-gray-400">
              {new Date(project.createdAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${project.id}?edit=true`}>
            <Button variant="outline" size="sm">
              <Edit3 size={14} className="mr-1" /> 编辑
            </Button>
          </Link>
          <Link href={`/projects/${project.id}/story`}>
            <Button size="sm">
              进入故事方案 <ArrowRight size={14} className="ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      {/* 基本信息 */}
      <Card>
        <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="故事类型" value={project.storyType} />
            <Field label="期望画风" value={project.artStyle} />
            <div className="col-span-2">
              <Field label="故事背景" value={project.background} />
            </div>
            <div className="col-span-2">
              <Field label="核心冲突" value={project.coreConflict} />
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 角色列表 */}
      <Card>
        <CardHeader><CardTitle>主要角色</CardTitle></CardHeader>
        <CardContent>
          {characters.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {characters.map((char, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium"
                >
                  {char}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">暂无角色信息</p>
          )}
        </CardContent>
      </Card>

      {/* 故事梗概 */}
      <Card>
        <CardHeader><CardTitle>故事梗概</CardTitle></CardHeader>
        <CardContent>
          {project.storySummary ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {project.storySummary}
            </p>
          ) : (
            <p className="text-gray-400 text-sm">暂无故事梗概</p>
          )}
        </CardContent>
      </Card>

      {/* 完整故事 */}
      {project.fullStory && (
        <Card>
          <CardHeader><CardTitle>完整故事</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {project.fullStory}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 平台配置 */}
      <Card>
        <CardHeader><CardTitle>输出配置</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-x-6 gap-y-4">
            <Field label="目标平台" value={project.targetPlatform} />
            <Field label="画面比例" value={project.aspectRatio} mono />
            <Field label="项目状态" value={project.status} mono />
            <Field label="预计集数" value={`${project.episodeCount} 集`} />
            <Field label="单集时长" value={`${project.episodeDuration} 秒`} />
            <Field
              label="最后更新"
              value={new Date(project.updatedAt).toLocaleString('zh-CN')}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
