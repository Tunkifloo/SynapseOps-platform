import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/shared/components/ui/toast"
import { useToast } from "@/shared/components/ui/use-toast"

/**
 * Render global de notificaciones. Montar una sola vez (en AppShell/root).
 * HU-020: auto-cierre a 3s (duration) y máx. 3 apilados (TOAST_LIMIT en use-toast).
 */
const TOAST_DURATION = 3000

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={TOAST_DURATION} swipeDirection="right">
      {toasts.map(({ id, title, description, action, duration, ...props }) => (
        // `duration` explícito por toast: garantiza el auto-cierre uniforme a 3s
        // (evita que algunas variantes no hereden la duración del provider).
        <Toast key={id} duration={duration ?? TOAST_DURATION} {...props}>
          <div className="grid flex-1 gap-1 pr-6">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
