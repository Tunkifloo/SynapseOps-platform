/**
 * Validadores de los formularios de autenticación, alineados a los DTOs
 * (LoginRequest, SignupPayload, ForgotPasswordRequest). Centralizan las reglas
 * para que login/signup/recuperar compartan los mismos mensajes y umbrales.
 */
import type { SignupPayload } from './types'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_RE = /^\d{9}$/
export const MIN_PASSWORD = 8

/** Devuelve un mensaje de error o `null` si el campo es válido. */
export type FieldError = string | null

export const validateRequired = (value: string, label: string): FieldError =>
  value.trim() ? null : `${label} es obligatorio.`

export const validateEmail = (value: string): FieldError => {
  if (!value.trim()) return 'El correo es obligatorio.'
  return EMAIL_RE.test(value.trim()) ? null : 'El formato del correo no es válido.'
}

export const validatePassword = (value: string, min: number = MIN_PASSWORD): FieldError => {
  if (!value) return 'La contraseña es obligatoria.'
  return value.length >= min ? null : `La contraseña debe tener al menos ${min} caracteres.`
}

export const validatePhone = (value: string): FieldError => {
  if (!value.trim()) return null // opcional
  return PHONE_RE.test(value.trim()) ? null : 'El teléfono debe tener exactamente 9 dígitos.'
}

export const validateConfirm = (password: string, confirm: string): FieldError => {
  if (!confirm) return 'Confirma tu contraseña.'
  return password === confirm ? null : 'Las contraseñas no coinciden.'
}

/** Estado de errores por campo del formulario de registro. */
export type SignupForm = SignupPayload & { confirmPassword: string }
export type SignupErrors = Partial<Record<keyof SignupForm, string>>

/** Valida el formulario de registro completo contra el SignupPayload. */
export function validateSignup(form: SignupForm): SignupErrors {
  const errors: SignupErrors = {}
  const set = (key: keyof SignupForm, err: FieldError) => {
    if (err) errors[key] = err
  }

  set('name', validateRequired(form.name, 'El nombre'))
  set('paternalSurname', validateRequired(form.paternalSurname, 'El apellido paterno'))
  set('username', validateRequired(form.username, 'El usuario'))
  set('studentCode', validateRequired(form.studentCode, 'El código de estudiante'))
  set('career', validateRequired(form.career, 'La carrera'))
  set('email', validateEmail(form.email))
  set('phone', validatePhone(form.phone ?? ''))
  set('password', validatePassword(form.password))
  set('confirmPassword', validateConfirm(form.password, form.confirmPassword))

  return errors
}
