export default function HomePage() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-900">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">🎬 AI 漫剧可视化生产工作台</h1>
        <p className="text-gray-400 mb-8 text-lg">AI 驱动的漫剧创作平台</p>
        <a
          href="/projects"
          className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
        >
          进入项目
        </a>
      </div>
    </div>
  )
}
