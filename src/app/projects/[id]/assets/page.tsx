import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default function AssetsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader><CardTitle>素材管理</CardTitle></CardHeader>
        <CardContent>
          <p className="text-gray-400">素材文件由角色图、场景参考图、分镜图、视频片段和发布包页面分别管理。</p>
        </CardContent>
      </Card>
    </div>
  )
}
