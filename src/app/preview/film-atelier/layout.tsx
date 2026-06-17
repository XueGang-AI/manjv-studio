import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Manjv Studio — Film Atelier',
  description: 'AI 漫剧创作平台 · Film Atelier 视觉实验',
}

export default function FilmAtelierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="film-atelier" className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] antialiased">
      {children}
    </div>
  )
}
