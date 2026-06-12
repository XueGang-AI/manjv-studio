'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * WorkflowShell — 工作流页面外壳组件
 *
 * 为 Phase 3 工作流页面迁移预留的布局组件。
 * 提供两栏布局：主内容区 + 可选右侧面板。
 *
 * 使用方式：
 * ```tsx
 * <WorkflowShell>
 *   <WorkflowShell.Main>{主内容}</WorkflowShell.Main>
 *   <WorkflowShell.RightPanel>{右侧面板}</WorkflowShell.RightPanel>
 * </WorkflowShell>
 * ```
 *
 * 右侧面板可折叠，默认宽度 320px。
 * 当前各工作流业务页面无需改动，Phase 3 迁移时逐个替换即可。
 */

interface WorkflowShellProps {
  children: React.ReactNode
  className?: string
}

interface WorkflowShellMainProps {
  children: React.ReactNode
  className?: string
}

interface WorkflowShellRightPanelProps {
  children: React.ReactNode
  className?: string
  defaultCollapsed?: boolean
  width?: number
}

const WorkflowShellContext = React.createContext<{
  rightPanelCollapsed: boolean
  setRightPanelCollapsed: (v: boolean) => void
}>({
  rightPanelCollapsed: false,
  setRightPanelCollapsed: () => {},
})

function WorkflowShellRoot({ children, className }: WorkflowShellProps) {
  const [rightPanelCollapsed, setRightPanelCollapsed] = React.useState(false)
  return (
    <WorkflowShellContext.Provider value={{ rightPanelCollapsed, setRightPanelCollapsed }}>
      <div className={cn('flex flex-1 overflow-hidden', className)}>
        {children}
      </div>
    </WorkflowShellContext.Provider>
  )
}

function WorkflowShellMain({ children, className }: WorkflowShellMainProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto', className)}>
      {children}
    </div>
  )
}

function WorkflowShellRightPanel({ children, className, defaultCollapsed, width = 320 }: WorkflowShellRightPanelProps) {
  const { rightPanelCollapsed, setRightPanelCollapsed } = React.useContext(WorkflowShellContext)
  const [internalCollapsed, setInternalCollapsed] = React.useState(defaultCollapsed ?? false)
  const collapsed = rightPanelCollapsed || internalCollapsed

  return (
    <div
      className={cn(
        'border-l border-[var(--color-border-dim)] bg-[var(--bg-surface)] flex flex-col overflow-hidden transition-all duration-200 shrink-0',
        collapsed ? 'w-0 border-l-0' : '',
        className
      )}
      style={!collapsed ? { width } : undefined}
    >
      {/* Toggle button */}
      <button
        onClick={() => setInternalCollapsed(!internalCollapsed)}
        className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-4 h-8 bg-[var(--bg-panel)] border border-[var(--color-border-dim)] rounded-l flex items-center justify-center cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors text-[var(--color-text-muted)]"
        title={collapsed ? '展开面板' : '收起面板'}
      >
        <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          {collapsed ? <path d="M6 2L2 6L6 10" /> : <path d="M2 2L6 6L2 10" />}
        </svg>
      </button>
      {!collapsed && children}
    </div>
  )
}

export const WorkflowShell = Object.assign(WorkflowShellRoot, {
  Main: WorkflowShellMain,
  RightPanel: WorkflowShellRightPanel,
})
