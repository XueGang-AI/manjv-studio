'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, RotateCcw, GitBranch, CheckCircle2, Clock, ArrowLeft } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  STORY_PACKAGE: '故事方案', CHARACTER_SET: '角色设定', CHARACTER_IMAGE_SET: '角色图',
  STORYBOARD: '分镜脚本', SHOT_IMAGE_SET: '分镜图', SHOT_VIDEO_SET: '视频片段',
  VOICE_SCRIPT: '配音文案', FINAL_VIDEO: '成片视频',
}
const CHANGE_LABELS: Record<string, string> = {
  GENERATE: '生成', REGENERATE: '重新生成', EDIT: '编辑', CONFIRM: '确认', ROLLBACK: '回退', SELECT: '选择',
}

interface Version {
  id: string; entityType: string; version: number; changeType: string
  description: string; isCurrent: boolean; isConfirmed: boolean; createdAt: string
}

export default function VersionsPage() {
  const params = useParams(); const searchParams = useSearchParams(); const router = useRouter()
  const projectId = params.id as string
  const filterType = searchParams.get('entity_type') || ''

  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expandId, setExpandId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Record<string,unknown> | null>(null)

  const fetchVersions = useCallback(async () => {
    const url = filterType
      ? `/api/projects/${projectId}/versions?entity_type=${filterType}`
      : `/api/projects/${projectId}/versions`
    const res = await fetch(url); const data = await res.json()
    if (data.success) setVersions(data.data || [])
    setLoading(false)
  }, [projectId, filterType])

  useEffect(() => { fetchVersions() }, [fetchVersions])

  const handleRollback = async (verId: string) => {
    if (!confirm('确认回退到此版本？这将恢复当时的项目状态。')) return
    setActionLoading(verId)
    await fetch(`/api/projects/${projectId}/versions/${verId}/rollback`, { method: 'POST' })
    await fetchVersions()
    setActionLoading(null)
  }

  const handleSetCurrent = async (verId: string) => {
    setActionLoading(verId)
    await fetch(`/api/projects/${projectId}/versions/${verId}/set-current`, { method: 'POST' })
    await fetchVersions()
    setActionLoading(null)
  }

  const toggleDetail = async (verId: string) => {
    if (expandId === verId) { setExpandId(null); setSnapshot(null); return }
    setExpandId(verId)
    const res = await fetch(`/api/projects/${projectId}/versions/${verId}`)
    const data = await res.json()
    if (data.success) setSnapshot(data.data.snapshot)
  }

  const grouped = versions.reduce<Record<string, Version[]>>((acc, v) => {
    const key = v.entityType; if (!acc[key]) acc[key] = []; acc[key].push(v); return acc
  }, {})

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">版本历史</h1>
          <p className="text-gray-500 mt-1">{versions.length} 条版本记录</p>
        </div>
        <Button variant="outline" onClick={fetchVersions}><RefreshCw size={16} /></Button>
      </div>

      {loading ? <p className="text-gray-400 text-center py-8">加载中...</p> : versions.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <GitBranch size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-400">暂无版本记录 — 版本会在生成/确认内容时自动创建</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, vers]) => (
            <div key={type}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <GitBranch size={14} /> {TYPE_LABELS[type] || type}
                <Badge variant="default">{vers.length}</Badge>
              </h3>
              <div className="space-y-2">
                {vers.map(v => (
                  <Card key={v.id} className={`border-l-4 ${v.isCurrent ? 'border-l-indigo-400 bg-indigo-50/30' : 'border-l-gray-200'}`}>
                    <div className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleDetail(v.id)}>
                      <span className="text-xs font-mono text-gray-400 w-10">v{v.version}</span>
                      <Badge variant="info">{CHANGE_LABELS[v.changeType] || v.changeType}</Badge>
                      <span className="text-sm flex-1 truncate">{v.description || '-'}</span>
                      {v.isCurrent && <Badge className="bg-indigo-100 text-indigo-700 text-xs">当前</Badge>}
                      {v.isConfirmed && <CheckCircle2 size={14} className="text-green-500" />}
                      <Clock size={12} className="text-gray-300" />
                      <span className="text-xs text-gray-400">{new Date(v.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                    {expandId === v.id && (
                      <div className="px-4 pb-3 border-t pt-2 flex gap-2">
                        {!v.isCurrent && (
                          <Button size="sm" onClick={() => handleSetCurrent(v.id)} disabled={actionLoading === v.id}>设为当前</Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleRollback(v.id)} disabled={actionLoading === v.id}>
                          <RotateCcw size={14} className="mr-1" /> 回退到此版本
                        </Button>
                        {snapshot && (
                          <div className="flex-1 ml-2 text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto font-mono">
                            {JSON.stringify(snapshot, null, 2).substring(0, 500)}...
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
