import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Manjv Studio V2 — UI 样板预览',
  description: 'AI 漫剧创作平台 · 第二版视觉样板',
}

export default function DemoV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-v2-root" style={{
      '--bg-base': '#070A13',
      '--bg-surface': '#0E1219',
      '--bg-elevated': '#151B28',
      '--bg-panel': '#1A2236',
      '--bg-input': '#111827',
      '--border-dim': 'rgba(139, 152, 186, 0.08)',
      '--border-default': 'rgba(139, 152, 186, 0.12)',
      '--border-bright': 'rgba(139, 152, 186, 0.22)',
      '--text-primary': '#ECF0F8',
      '--text-secondary': '#A0AECF',
      '--text-muted': '#5B6A8A',
      '--text-accent': '#818CF8',
      '--primary': '#6366F1',
      '--primary-hover': '#818CF8',
      '--primary-muted': 'rgba(99, 102, 241, 0.12)',
      '--primary-glow': 'rgba(99, 102, 241, 0.25)',
      '--accent-cyan': '#22D3EE',
      '--accent-cyan-muted': 'rgba(34, 211, 238, 0.10)',
      '--accent-violet': '#A78BFA',
      '--accent-violet-muted': 'rgba(167, 139, 250, 0.10)',
      '--accent-emerald': '#34D399',
      '--accent-emerald-muted': 'rgba(52, 211, 153, 0.10)',
      '--success': '#34D399',
      '--success-muted': 'rgba(52, 211, 153, 0.10)',
      '--warning': '#FBBF24',
      '--warning-muted': 'rgba(251, 191, 36, 0.10)',
      '--error': '#F87171',
      '--error-muted': 'rgba(248, 113, 113, 0.10)',
      '--info': '#60A5FA',
      '--info-muted': 'rgba(96, 165, 250, 0.10)',
      '--gradient-primary': 'linear-gradient(135deg, #6366F1, #818CF8)',
      '--gradient-accent': 'linear-gradient(135deg, #6366F1, #22D3EE)',
      '--gradient-surface': 'linear-gradient(180deg, #151B28, #0E1219)',
      '--glow-primary': '0 0 24px rgba(99, 102, 241, 0.18)',
      '--glow-cyan': '0 0 24px rgba(34, 211, 238, 0.15)',
      '--glow-emerald': '0 0 16px rgba(52, 211, 153, 0.15)',
      '--shadow-card': '0 1px 3px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.25)',
      '--shadow-elevated': '0 4px 20px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.3)',
      '--radius-sm': '6px',
      '--radius-md': '10px',
      '--radius-lg': '14px',
      '--radius-xl': '20px',
    } as React.CSSProperties}>
      <style>{`
        .demo-v2-root {
          background: var(--bg-base);
          color: var(--text-primary);
          min-height: 100vh;
          font-family: var(--font-geist-sans), "Inter", system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .demo-v2-root ::-webkit-scrollbar { width: 5px; height: 5px; }
        .demo-v2-root ::-webkit-scrollbar-track { background: transparent; }
        .demo-v2-root ::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
        .demo-v2-root ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
        @keyframes pulse-glow { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .animate-shimmer { animation: shimmer 2s linear infinite; background-size: 200% 100%; }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
      `}</style>
      {children}
    </div>
  )
}
