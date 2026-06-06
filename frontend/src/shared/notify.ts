import type { ReactNode } from "react"

import { toast } from "@/shared/components/ui/use-toast"

type NotifyOptions = {
  description?: ReactNode
  /** ms; por defecto el <Toaster/> aplica 5000. */
  duration?: number
}

/**
 * API ergonómica de notificaciones (HU-020).
 * Es un singleton de módulo: puede invocarse desde componentes, hooks o capa
 * de datos (p. ej. el cliente HTTP) sin necesidad de estar dentro de React.
 *
 * Variantes → tokens semánticos: success (verde), warning (ámbar),
 * info (azul), error/destructive (rojo).
 */
export const notify = {
  success: (title: ReactNode, opts?: NotifyOptions) =>
    toast({ variant: "success", title, ...opts }),
  error: (title: ReactNode, opts?: NotifyOptions) =>
    toast({ variant: "destructive", title, ...opts }),
  warning: (title: ReactNode, opts?: NotifyOptions) =>
    toast({ variant: "warning", title, ...opts }),
  info: (title: ReactNode, opts?: NotifyOptions) =>
    toast({ variant: "info", title, ...opts }),
  message: (title: ReactNode, opts?: NotifyOptions) =>
    toast({ title, ...opts }),
}

export type Notify = typeof notify
