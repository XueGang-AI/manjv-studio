/**
 * 开发预览：真实视频媒体组件验证（Phase 3）。
 * --------------------------------------------
 * Server Component：从服务端环境变量读取测试项目 ID（PREVIEW_PROJECT_ID /
 * PREVIEW_EPISODE_ID），不暴露为 NEXT_PUBLIC_ 客户端变量。
 * 实际交互由 MediaPreviewClient（client component）承担。
 *
 * 开发预览页，生产导航无入口；不修改业务路由。
 */
import { MediaPreviewClient } from './media-preview-client'

export default function MediaPreviewPage() {
  const projectId = process.env.PREVIEW_PROJECT_ID || ''
  const episodeId = process.env.PREVIEW_EPISODE_ID || ''
  const configured = Boolean(projectId && episodeId)

  return <MediaPreviewClient projectId={projectId} episodeId={episodeId} configured={configured} />
}
