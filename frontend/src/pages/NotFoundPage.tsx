import { Link } from 'react-router'
import { AuthCard } from '../components/AuthCard.tsx'

export function NotFoundPage() {
  return (
    <AuthCard title="Page not found">
      <p className="text-center text-sm">
        <Link to="/" className="font-medium text-primary hover:text-primary-hover">
          Back to the dashboard
        </Link>
      </p>
    </AuthCard>
  )
}
