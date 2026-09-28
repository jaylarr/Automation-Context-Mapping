import Link from 'next/link'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/ui'

export default function NotFound() {
  return (
    <EmptyState icon={Compass} title="Page not found" action={<Link href="/" className="btn">Back to overview</Link>}>
      The page or project you’re looking for doesn’t exist, or its folder was renamed.
    </EmptyState>
  )
}
