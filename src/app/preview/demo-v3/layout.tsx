import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Manjv Studio V3 — Aurora Studio',
  description: 'AI 漫剧创作平台 · Aurora Studio 视觉样板',
}

export default function DemoV3Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="demo-v3-root" style={{
      '--bg-base': '#090D18',
      '--bg-surface': '#0E1424',
      '--bg-elevated': '#141C2E',
      '--bg-panel': '#1B2540',
      '--bg-input': '#111827',
      '--border-dim': 'rgba(148, 163, 184, 0.06)',
      '--border-default': 'rgba(148, 163, 184, 0.10)',
      '--border-bright': 'rgba(148, 163, 184, 0.20)',
      '--text-primary': '#F8FAFC',
      '--text-secondary': '#CBD5E1',
      '--text-muted': '#64748B',
      '--primary': '#6366F1',
      '--primary-hover': '#818CF8',
      '--primary-muted': 'rgba(99, 102, 241, 0.10)',
      '--accent-cyan': '#22D3EE',
      '--accent-cyan-muted': 'rgba(34, 211, 238, 0.08)',
      '--accent-violet': '#A78BFA',
      '--accent-violet-muted': 'rgba(167, 139, 250, 0.10)',
      '--success': '#34D399',
      '--success-muted': 'rgba(52, 211, 153, 0.10)',
      '--warning': '#FBBF24',
      '--warning-muted': 'rgba(251, 191, 36, 0.10)',
      '--error': '#F87171',
      '--error-muted': 'rgba(248, 113, 113, 0.10)',
      '--info': '#60A5FA',
      '--info-muted': 'rgba(96, 165, 250, 0.10)',
      '--gradient-aurora': 'linear-gradient(135deg, #6366F1, #22D3EE)',
      '--gradient-aurora-subtle': 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(34, 211, 238, 0.08))',
      '--gradient-aurora-border': 'linear-gradient(135deg, rgba(99, 102, 241, 0.5), rgba(34, 211, 238, 0.5))',
      '--glow-aurora': '0 0 20px rgba(99, 102, 241, 0.12), 0 0 40px rgba(34, 211, 238, 0.06)',
      '--glow-primary': '0 0 16px rgba(99, 102, 241, 0.12)',
      '--glow-cyan': '0 0 16px rgba(34, 211, 238, 0.10)',
      '--shadow-card': '0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)',
      '--shadow-elevated': '0 4px 16px rgba(0,0,0,0.4), 0 8px 28px rgba(0,0,0,0.3)',
      '--radius-sm': '6px',
      '--radius-md': '10px',
      '--radius-lg': '14px',
      '--radius-xl': '20px',
    } as React.CSSProperties}>
      <style>{`
        .demo-v3-root {
          background: var(--bg-base);
          color: var(--text-primary);
          min-height: 100vh;
          font-family: var(--font-geist-sans), "Inter", system-ui, -apple-system, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .demo-v3-root ::-webkit-scrollbar { width: 5px; height: 5px; }
        .demo-v3-root ::-webkit-scrollbar-track { background: transparent; }
        .demo-v3-root ::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
        .demo-v3-root ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
        @keyframes pulse-glow { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes aurora-shift { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        .animate-pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        .animate-shimmer { animation: shimmer 2s linear infinite; background-size: 200% 100%; }
        .animate-aurora { animation: aurora-shift 3s ease-in-out infinite; }
        .aurora-border { position: relative; }
        .aurora-border::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: var(--gradient-aurora);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .aurora-text {
          background: var(--gradient-aurora);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .aurora-line {
          background: var(--gradient-aurora);
          height: 2px;
          border-radius: 1px;
        }
        .aurora-dot {
          background: var(--gradient-aurora);
          box-shadow: var(--glow-aurora);
        }
      `}</style>
      {children}
    </div>
  )
}
