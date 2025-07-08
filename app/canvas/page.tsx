import { auth } from '../../auth'
import { redirect } from 'next/navigation'
import CanvasManager from './CanvasManager'

export default async function CanvasPage() {
  const session = await auth()
  
  if (!session?.user) {
    redirect('/auth/signin')
  }

  return <CanvasManager />
} 