'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { TopBar } from '@/components/layout/topbar'

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-[var(--bg-base)]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-[var(--bg-base)]">
          {children}
        </main>
      </div>
    </div>
  )
}
