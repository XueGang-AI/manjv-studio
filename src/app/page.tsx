import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-base)]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-[var(--radius-xl)] flex items-center justify-center mx-auto mb-6" style={{ background: 'var(--gradient-aurora)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Zm-1.7 1.3L9.5 12.2"/><path d="m22 12.4-2.6-.7c-.5-.1-1.1-.1-1.5.2l-3.8 2.6c-.5.3-1.1.4-1.6.2L6.6 12.2"/><path d="M2 16.1l4.6.6c.5.1 1.1-.1 1.5-.3l3.8-2.6c.5-.3 1.1-.4 1.6-.2l4.2 1.3"/><path d="M7.5 20.5 9 19l1.5 1.5L12 19l1.5 1.5"/></svg>
        </div>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] mb-3">Manjv Studio</h1>
        <p className="text-[var(--color-text-muted)] mb-8 text-base">AI 漫剧创作平台 — 从故事到成片，全流程自动化</p>
        <Link
          href="/projects"
          className="inline-flex items-center px-6 py-3 rounded-[var(--radius-md)] text-white font-medium no-underline transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'var(--gradient-aurora)', boxShadow: 'var(--glow-aurora)' }}
        >
          进入工作台
        </Link>
      </div>
    </div>
  )
}
