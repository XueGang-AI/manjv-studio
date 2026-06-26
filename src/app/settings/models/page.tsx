'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const MODEL_CONFIGS = [
  { name: 'doubao-seed-character', type: 'TEXT', status: '环境变量', description: '故事分析、角色设定、分镜脚本' },
  { name: 'doubao-seedream', type: 'IMAGE', status: '环境变量', description: '角色图、场景图、分镜图' },
  { name: 'doubao-seedance', type: 'VIDEO', status: '环境变量', description: '分镜图动态化和视频片段生成' },
]

export default function ModelsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">模型设置</h1>
      <p className="text-gray-500 mb-6">
        当前运行时固定使用豆包 Ark，配置通过环境变量读取。
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
                <Badge variant="info">{model.status}</Badge>
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
