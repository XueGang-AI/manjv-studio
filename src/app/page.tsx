import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let href = '/projects'

  try {
    const latestProject = await prisma.project.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })

    if (latestProject) href = `/projects/${latestProject.id}`
  } catch {
    // Keep the app entry available even if the project lookup fails.
  }

  redirect(href)
}
