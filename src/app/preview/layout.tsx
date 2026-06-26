import { notFound } from 'next/navigation'

/**
 * Preview 路由服务端保护
 * --------------------------------------------
 * /preview/* 下的页面仅用于开发与回归验证，生产环境不可访问。
 * 通过服务端路由边界阻止访问（非客户端隐藏内容）。
 *
 * 保护对象：film-atelier / workflow-states / media / image-states
 * 不影响本地开发环境（NODE_ENV === 'development' 可访问）。
 *
 * 注意：Preview Layout 保持 Server Component，不在客户端做隐藏。
 */
export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }
  return <>{children}</>
}
