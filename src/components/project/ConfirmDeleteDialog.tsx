'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  projectName: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeleteDialog({ open, projectName, loading, onConfirm, onCancel }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />

      {/* 对话框 */}
      <div className="relative z-10 bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">确认删除项目</h3>
            <p className="text-sm text-gray-500 mt-1">
              此操作将永久删除项目 <span className="font-medium text-gray-700">「{projectName}」</span> 及其所有关联数据（故事方案、角色、分镜、图片、视频等），无法恢复。
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? '删除中...' : '确认删除'}
          </Button>
        </div>
      </div>
    </div>
  )
}
