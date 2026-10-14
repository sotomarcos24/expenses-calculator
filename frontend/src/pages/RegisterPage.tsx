import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../api/client.ts'
import { AuthCard } from '../components/AuthCard.tsx'
import { Button } from '../components/Button.tsx'
import { FormError } from '../components/FormError.tsx'
import { TextField } from '../components/TextField.tsx'
import { useRegister } from '../hooks/useAuth.ts'
import { fieldErrorsFrom422, GENERIC_ERROR } from '../lib/authErrors.ts'
import {
  EMAIL_INVALID,
  registerSchema,
  type RegisterFormInput,
  type RegisterFormValues,
} from '../lib/authSchemas.ts'

export const EMAIL_TAKEN = 'An account with this email already exists'

const FIELD_MESSAGES_422 = {
  email: EMAIL_INVALID,
  password: 'Password must be between 8 and 128 characters',
}

export function RegisterPage() {
  const navigate = useNavigate()
  const registerUser = useRegister()
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<RegisterFormInput, unknown, RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = (values: RegisterFormValues) => {
    clearErrors()
    registerUser.mutate(values, {
      onSuccess: () => navigate('/', { replace: true }),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          setError('email', {
            type: 'server',
            message: typeof error.detail === 'string' ? error.detail : EMAIL_TAKEN,
          })
          return
        }
        const fieldErrors = fieldErrorsFrom422(error, FIELD_MESSAGES_422)
        if (fieldErrors) {
          for (const [field, message] of Object.entries(fieldErrors)) {
            setError(field as keyof RegisterFormInput, { type: 'server', message })
          }
          return
        }
        setError('root.server', { type: 'server', message: GENERIC_ERROR })
      },
    })
  }

  const pending = registerUser.isPending

  return (
    <AuthCard title="Create your account">
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
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" fullWidth disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:text-primary-hover">
          Log in
        </Link>
      </p>
    </AuthCard>
  )
}
