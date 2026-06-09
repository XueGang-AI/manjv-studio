'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const MODEL_CONFIGS = [
  { name: 'Agnes-2.0-Flash', type: 'TEXT', status: '未配置', description: '文本生成模型，用于故事分析、角色设定、分镜脚本等' },
  { name: 'Agnes-Image-2.0-Flash', type: 'IMAGE', status: '未配置', description: '图片生成模型，用于角色图、分镜图、封面图等' },
  { name: 'Agnes-Video-2.0', type: 'VIDEO', status: '未配置', description: '视频生成模型，用于分镜图动态化和视频片段生成' },
]

export default function ModelsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">模型设置</h1>
      <p className="text-gray-500 mb-6">
        管理 AI 模型连接配置。Phase 1 仅展示占位，Phase 2+ 接入真实 API。
      </p>

      <div className="space-y-4 max-w-2xl">
        {MODEL_CONFIGS.map((model) => (
          <Card key={model.name}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {model.name}
                <Badge variant={model.type === 'TEXT' ? 'info' : model.type === 'IMAGE' ? 'warning' : 'success'}>
                  {model.type}
                </Badge>
                <Badge variant="danger">未配置</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">{model.description}</p>
              <div className="mt-3 text-xs text-gray-400">
                API Base URL、API Key 请在 .env 文件中配置
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
