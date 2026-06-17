'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, AlertTriangle, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface QCIssue { level: string; field: string; problem: string; suggestion: string }
interface QCResult { score: number; passed: boolean; level: string; issues: QCIssue[]; summary: string; rewrite_required: boolean }

const LEVEL_COLORS: Record<string, string> = {
  excellent: 'bg-green-100 text-green-700', good: 'bg-blue-100 text-blue-700',
  warning: 'bg-yellow-100 text-yellow-700', failed: 'bg-red-100 text-red-700',
}

export default function QCProjectPage() {
  const params = useParams(); const projectId = params.id as string
  const [results, setResults] = useState<QCResult[]>([])
  const [reports, setReports] = useState<Array<{id:string;score:number;passed:boolean;createdAt:string}>>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchReports = async () => {
    const res = await fetch(`/api/projects/${projectId}/qc/reports`)
    const data = await res.json()
    if (data.success) setReports(data.data || [])
    setLoading(false)
  }

  // 仅在 projectId 变化时拉取，fetchReports 内部依赖 projectId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { queueMicrotask(() => fetchReports()) }, [projectId])

  const runQC = async () => {
    setRunning(true); setError(null); setResults([])
    try {
      const res = await fetch(`/api/projects/${projectId}/qc/run`, { method: 'POST' })
      const data = await res.json()
      if (data.success) { setResults(data.data.results || []); await fetchReports() }
      else setError(data.error)
    } catch { setError('QC 运行失败') }
    finally { setRunning(false) }
  }

  const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">质量检查 QC</h1>
          <p className="text-gray-500 mt-1">检查项目各阶段的质量完整性</p>
        </div>
        <Button onClick={runQC} disabled={running} size="lg">
          {running ? <><Loader2 size={16} className="animate-spin mr-2" /> 检查中...</> : <><Play size={16} className="mr-2" /> 运行 QC</>}
        </Button>
      </div>

      {error && <div className="mb-4 bg-red-50 p-3 rounded text-sm text-red-600">{error}</div>}

      {/* 总评分 */}
      {results.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold">{avgScore}</div>
              <div>
                <p className="text-sm text-gray-500">综合评分</p>
                <Badge className={avgScore >= 90 ? 'bg-green-100 text-green-700' : avgScore >= 75 ? 'bg-blue-100 text-blue-700' : avgScore >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}>
                  {avgScore >= 90 ? '优秀' : avgScore >= 75 ? '良好' : avgScore >= 60 ? '警告' : '不合格'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* QC 结果列表 */}
      {results.map((r, i) => (
        <Card key={i} className={`mb-4 border-l-4 ${r.passed ? 'border-l-green-400' : 'border-l-red-400'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className={`text-lg font-bold ${r.passed ? 'text-green-600' : 'text-red-600'}`}>{r.score}</span>
              <Badge className={LEVEL_COLORS[r.level]}>{r.level}</Badge>
              {r.passed ? <CheckCircle2 size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
              <span className="text-gray-400 text-xs ml-auto">{r.summary}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {r.issues.length === 0 ? (
              <p className="text-sm text-green-600">✅ 未发现问题</p>
            ) : (
              <div className="space-y-2">
                {r.issues.map((issue, j) => (
                  <div key={j} className="flex items-start gap-2 text-sm p-2 bg-gray-50 rounded">
                    {issue.level === 'high' ? <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" /> :
                     issue.level === 'medium' ? <AlertCircle size={14} className="text-yellow-500 mt-0.5 shrink-0" /> :
                     <AlertCircle size={14} className="text-gray-400 mt-0.5 shrink-0" />}
                    <div>
                      <span className="font-medium text-gray-700">{issue.field}</span>
                      <span className="text-gray-600 ml-1">{issue.problem}</span>
                      {issue.suggestion && <p className="text-xs text-indigo-500 mt-0.5">💡 {issue.suggestion}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {r.rewrite_required && <p className="text-xs text-red-500 mt-2">⚠️ 建议根据问题优化后重新生成</p>}
          </CardContent>
        </Card>
      ))}

      {/* 历史报告 */}
      {reports.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle>历史报告 ({reports.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {reports.slice(0, 10).map(r => (
                <div key={r.id} className="flex items-center gap-3 text-xs py-1.5 border-b">
                  <span className="font-mono font-bold">{r.score}</span>
                  <Badge variant={r.passed ? 'success' : 'danger'}>{r.passed ? '通过' : '未通过'}</Badge>
                  <span className="text-gray-400">{new Date(r.createdAt).toLocaleString('zh-CN')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!running && results.length === 0 && reports.length === 0 && !loading && (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16">
          <AlertCircle size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-400">点击&quot;运行 QC&quot;检查项目质量</p>
        </CardContent></Card>
      )}
    </div>
  )
}
