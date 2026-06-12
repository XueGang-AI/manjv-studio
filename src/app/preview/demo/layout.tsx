import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Manjv Studio — UI 样板预览',
  description: '前端重构视觉风格确认样板',
}

/**
 * 样板页布局 — 使用独立的深色主题，不影响生产页面
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-preview-root" style={{
      // 内联注入 design tokens，不影响全局
      '--color-void': '#0B0D11',
      '--color-abyss': '#12151C',
      '--color-deep': '#1A1E2A',
      '--color-surface': '#232838',
      '--color-elevated': '#2D3348',
      '--color-text-primary': '#E8EAF0',
      '--color-text-secondary': '#9BA1B7',
      '--color-text-muted': '#5C6280',
      '--color-accent': '#E8853A',
      '--color-accent-hover': '#F09A55',
      '--color-accent-muted': 'rgba(232, 133, 58, 0.15)',
      '--color-success': '#34D399',
      '--color-success-muted': 'rgba(52, 211, 153, 0.12)',
      '--color-warning': '#FBBF24',
      '--color-warning-muted': 'rgba(251, 191, 36, 0.12)',
      '--color-danger': '#F87171',
      '--color-danger-muted': 'rgba(248, 113, 113, 0.12)',
      '--color-info': '#60A5FA',
      '--color-info-muted': 'rgba(96, 165, 250, 0.12)',
      '--color-border': 'rgba(255, 255, 255, 0.06)',
      '--color-border-hover': 'rgba(255, 255, 255, 0.12)',
      '--radius-sm': '6px',
      '--radius-md': '10px',
      '--radius-lg': '14px',
      '--radius-xl': '20px',
      '--shadow-card': '0 1px 3px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)',
      '--shadow-elevated': '0 4px 16px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.3)',
      '--shadow-glow': '0 0 20px rgba(232, 133, 58, 0.15)',
    } as React.CSSProperties}>
      <style>{`
        .demo-preview-root {
          background: var(--color-void);
          color: var(--color-text-primary);
          min-height: 100vh;
          font-family: var(--font-geist-sans), "Inter", system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .demo-preview-root ::-webkit-scrollbar { width: 6px; height: 6px; }
        .demo-preview-root ::-webkit-scrollbar-track { background: transparent; }
        .demo-preview-root ::-webkit-scrollbar-thumb { background: var(--color-elevated); border-radius: 3px; }
      `}</style>
      {children}
    </div>
  )
}
