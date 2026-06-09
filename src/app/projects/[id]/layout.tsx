'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { StepNavigator } from '@/components/project/step-navigator'

export default function ProjectDetailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const projectId = params.id as string
  const [status, setStatus] = useState('DRAFT')

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.status) {
          setStatus(data.data.status)
        }
      })
      .catch(() => { /* keep default */ })
  }, [projectId])

  return (
    <div className="flex flex-col h-full">
      <StepNavigator projectId={projectId} currentStatus={status} />
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  )
}
