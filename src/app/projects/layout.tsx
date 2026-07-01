'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/topbar'

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div data-theme="production-workbench" className="flex h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--color-text-primary)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="workbench-grid-bg flex-1 overflow-y-auto bg-[var(--bg-base)]">
          {children}
        </main>
      </div>
    </div>
  )
}
