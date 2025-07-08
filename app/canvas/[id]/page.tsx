import { auth } from '../../../auth'
import { redirect } from 'next/navigation'
import { TldrawWrapper } from '../../../components/TldrawWrapper'

interface CanvasPageProps {
  params: Promise<{ id: string }>
}

export default async function CanvasPage({ params }: CanvasPageProps) {
  const session = await auth()
  
  if (!session?.user) {
    redirect('/auth/signin')
  }

  const { id } = await params

  return (
    <div>
      <TldrawWrapper canvasId={id} />
    </div>
  )
} 