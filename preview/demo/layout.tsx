import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Manjv Studio — UI 样板预览',
  description: '前端重构视觉风格确认样板',
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
