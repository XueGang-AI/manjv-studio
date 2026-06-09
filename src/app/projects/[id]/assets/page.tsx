import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function AssetsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader><CardTitle>素材管理</CardTitle></CardHeader>
        <CardContent>
          <p className="text-gray-400">此页面将在 Phase 10 实现，展示素材文件列表和下载。</p>
        </CardContent>
      </Card>
    </div>
  )
}
