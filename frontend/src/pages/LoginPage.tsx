import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { AuthCard } from '../components/AuthCard.tsx'
import { Button } from '../components/Button.tsx'
import { FormError } from '../components/FormError.tsx'
import { TextField } from '../components/TextField.tsx'
import { isUnauthorized, useLogin } from '../hooks/useAuth.ts'
import {
  fieldErrorsFrom422,
  GENERIC_ERROR,
  isRateLimited,
  TOO_MANY_ATTEMPTS,
} from '../lib/authErrors.ts'
import {
  EMAIL_INVALID,
  loginSchema,
  PASSWORD_TOO_LONG,
  type LoginFormInput,
  type LoginFormValues,
} from '../lib/authSchemas.ts'
import { redirectTargetFromState } from '../lib/redirect.ts'

export const INVALID_CREDENTIALS = 'Invalid email or password'

const FIELD_MESSAGES_422 = { email: EMAIL_INVALID, password: PASSWORD_TOO_LONG }

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useLogin()
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<LoginFormInput, unknown, LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = (values: LoginFormValues) => {
    clearErrors()
    login.mutate(values, {
      onSuccess: () => navigate(redirectTargetFromState(location.state), { replace: true }),
      onError: (error) => {
        // Never say which field was wrong.
        if (isUnauthorized(error)) {
          setError('root.server', { type: 'server', message: INVALID_CREDENTIALS })
          return
        }
        if (isRateLimited(error)) {
          setError('root.server', { type: 'server', message: TOO_MANY_ATTEMPTS })
          return
        }
        const fieldErrors = fieldErrorsFrom422(error, FIELD_MESSAGES_422)
        if (fieldErrors) {
          for (const [field, message] of Object.entries(fieldErrors)) {
            setError(field as keyof LoginFormInput, { type: 'server', message })
          }
          return
        }
        setError('root.server', { type: 'server', message: GENERIC_ERROR })
      },
    })
  }

  const pending = login.isPending

  return (
    <AuthCard title="Log in">
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormError message={errors.root?.server?.message} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" fullWidth disabled={pending}>
          {pending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        No account?{' '}
        <Link to="/register" className="font-medium text-primary hover:text-primary-hover">
          Sign up
        </Link>
      </p>
    </AuthCard>
  )
}
