import { Link } from 'react-router'
import { AuthCard } from '../components/AuthCard.tsx'

export function RegisterPage() {
  return (
    <AuthCard title="Create your account">
      <p className="text-center text-sm text-muted">The sign-up form arrives in milestone 2.</p>
      <p className="mt-4 text-center text-sm">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:text-primary-hover">
          Log in
        </Link>
      </p>
    </AuthCard>
  )
}
