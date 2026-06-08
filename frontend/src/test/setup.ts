import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Limpia el DOM entre tests para evitar fugas de estado.
afterEach(() => {
  cleanup()
})
