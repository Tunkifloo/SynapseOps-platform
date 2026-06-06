import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Terminal, Trash2 } from 'lucide-react'

import { API_BASE_URL } from '@/shared/api/env'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/lib/utils'

interface LogLine {
  level: string
  message: string
  timestamp: string
}

interface LogConsoleProps {
  token: string
  workspaceId: number
  pipelineId: number
  executionId: number
}

const levelClass = (level: string) =>
  level === 'ERROR' ? 'text-destructive' : level === 'WARN' ? 'text-warning' : 'text-info'

/**
 * Consola de logs en tiempo real (HU-023 / ADR-002). Se suscribe vía SSE
 * (EventSource con `?token=` porque no admite cabeceras) y muestra los eventos
 * de la ejecución con auto-scroll. Cierra el stream al recibir el evento terminal.
 */
export function LogConsole({ token, workspaceId, pipelineId, executionId }: LogConsoleProps) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [open, setOpen] = useState(true)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setLines([])
    const url =
      `${API_BASE_URL}/workspaces/${workspaceId}/pipelines/${pipelineId}` +
      `/executions/${executionId}/logs?token=${encodeURIComponent(token)}`
    const source = new EventSource(url)

    source.addEventListener('log', (event: Event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as LogLine & { terminal?: boolean }
        setLines((prev) => [...prev, { level: data.level, message: data.message, timestamp: data.timestamp }])
        if (data.terminal) source.close()
      } catch {
        /* evento no parseable: ignorar */
      }
    })
    source.onerror = () => source.close()

    return () => source.close()
  }, [token, workspaceId, pipelineId, executionId])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, open])

  return (
    <div className="shrink-0 overflow-hidden rounded-2xl border border-border bg-card/60">
      <div className="flex items-center justify-between px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-sm font-semibold transition-colors hover:bg-accent/40"
          aria-expanded={open}
        >
          <Terminal className="size-4 text-primary" /> Consola de logs
          <span className="font-mono text-xs text-muted-foreground">#{executionId}</span>
          {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
        <Button variant="ghost" size="xs" onClick={() => setLines([])} aria-label="Limpiar logs">
          <Trash2 />
          Limpiar
        </Button>
      </div>
      {open && (
        <div className="max-h-44 overflow-auto border-t border-border bg-background/60 p-3 font-mono text-xs leading-relaxed">
          {lines.length === 0 ? (
            <p className="text-muted-foreground">Esperando eventos…</p>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/60">
                  {line.timestamp?.slice(11, 19)}
                </span>
                <span className={cn('shrink-0 font-semibold', levelClass(line.level))}>
                  {line.level}
                </span>
                <span className="text-foreground/90">{line.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
