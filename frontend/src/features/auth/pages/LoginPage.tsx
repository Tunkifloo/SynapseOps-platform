import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { login } from '@/features/auth/api'
import { LoginForm } from '@/features/auth/components/LoginForm'
import { useAuthSession } from '@/features/auth/hooks/useAuthSession'
import { isApiError } from '@/shared/api/client'

export function LoginPage() {
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()
  const { persistSession } = useAuthSession()

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const data = await login(credential.trim(), password)
      persistSession(data.token, credential)
      navigate('/dashboard')
    } catch (caught) {
      if (isApiError(caught) && caught.status === 423) {
        navigate('/forgot-password')
        return
      }
      setError(caught instanceof Error ? caught.message : 'No se pudo iniciar sesión.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCredentialChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCredential(event.target.value)
  }

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value)
  }

  return (
    <LoginForm
      credential={credential}
      password={password}
      error={error}
      isLoading={isLoading}
      onCredentialChange={handleCredentialChange}
      onPasswordChange={handlePasswordChange}
      onSubmit={handleLogin}
    />
  )
}
