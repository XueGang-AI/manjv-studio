'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
}

export function TopBar() {
  const pathname = usePathname()

  // 根据路径生成面包屑
  const breadcrumbs = generateBreadcrumbs(pathname)

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 gap-4">
      {/* 面包屑 */}
      <nav className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <ChevronRight size={14} className="text-gray-400" />}
            {item.href ? (
              <Link href={item.href} className="text-gray-500 hover:text-gray-900 transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={cn(index === breadcrumbs.length - 1 ? 'text-gray-900 font-medium' : 'text-gray-500')}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* 右侧操作区 */}
      <div className="ml-auto flex items-center gap-3">
        <Link
          href="/settings/models"
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          模型设置
        </Link>
        <Link
          href="/prompts"
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          Prompt 模板
        </Link>
      </div>
    </header>
  )
}

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: BreadcrumbItem[] = []

  if (segments.length === 0) {
    return [{ label: '首页', href: '/' }]
  }

  let currentPath = ''
  for (const segment of segments) {
    currentPath += `/${segment}`
    // 将路径段转为可读标签
    const label = segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

    crumbs.push({
      label: label.length > 20 ? label.slice(0, 20) + '...' : label,
      href: currentPath,
    })
  }

  return crumbs
}
