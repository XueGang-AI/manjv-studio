'use client'

import React from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProjectStatusBadge } from './ProjectStatusBadge'
import { Trash2, Edit3, Eye } from 'lucide-react'
import type { ProjectListItem } from '@/lib/types'

interface Props {
  project: ProjectListItem
  onDelete: (id: string, name: string) => void
}

export function ProjectCard({ project, onDelete }: Props) {
  return (
    <Card className="hover:shadow-md transition-shadow group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base pr-2">
            <Link href={`/projects/${project.id}`} className="hover:text-indigo-600 transition-colors">
              {project.projectName}
            </Link>
          </CardTitle>
          <ProjectStatusBadge status={project.status} />
        </div>
      </CardHeader>

      <CardContent>
        {/* 标签 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {project.storyType && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
              {project.storyType}
            </span>
          )}
          {project.artStyle && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">
              {project.artStyle}
            </span>
          )}
          {project.targetPlatform && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
              {project.targetPlatform}
            </span>
          )}
        </div>

        {/* 信息 */}
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
          <span>📺 {project.episodeCount} 集</span>
          <span>⏱ {project.episodeDuration}s/集</span>
          <span className="col-span-2">📅 {new Date(project.updatedAt).toLocaleDateString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
          })}</span>
        </div>

        {/* 操作 */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <Link href={`/projects/${project.id}`} className="flex-1">
            <Button variant="ghost" size="sm" className="w-full text-gray-500 hover:text-indigo-600">
              <Eye size={14} className="mr-1" /> 查看
            </Button>
          </Link>
          <Link href={`/projects/${project.id}?edit=true`} className="flex-1">
            <Button variant="ghost" size="sm" className="w-full text-gray-500 hover:text-indigo-600">
              <Edit3 size={14} className="mr-1" /> 编辑
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-gray-500 hover:text-red-600"
            onClick={() => onDelete(project.id, project.projectName)}
          >
            <Trash2 size={14} className="mr-1" /> 删除
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
