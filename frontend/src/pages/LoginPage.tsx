import { Link } from 'react-router'
import { AuthCard } from '../components/AuthCard.tsx'

export function LoginPage() {
  return (
    <AuthCard title="Log in">
      <p className="text-center text-sm text-muted">The login form arrives in milestone 2.</p>
      <p className="mt-4 text-center text-sm">
        No account?{' '}
        <Link to="/register" className="font-medium text-primary hover:text-primary-hover">
          Sign up
        </Link>
      </p>
    </AuthCard>
  )
}
