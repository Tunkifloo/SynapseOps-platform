import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface DataColumn<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** Clases para la celda (td), p. ej. 'text-right'. */
  className?: string
  /** Clases para el encabezado (th). */
  headerClassName?: string
  /** Tooltip del encabezado. */
  title?: string
}

interface DataTableProps<T> {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** Contenido a mostrar cuando no hay filas (p. ej. <EmptyState/>). */
  empty?: ReactNode
  /** Ancho mínimo de la tabla antes de scroll horizontal. */
  minWidth?: number
  onRowClick?: (row: T) => void
}

/**
 * Tabla de datos consistente para todos los módulos: mismo estilo de encabezado,
 * separadores, hover y scroll horizontal. Las celdas se controlan por `render`.
 */
export function DataTable<T>({ columns, rows, rowKey, empty, minWidth = 640, onRowClick }: DataTableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {columns.map((c) => (
              <th key={c.key} title={c.title} className={cn('px-4 py-3 font-semibold', c.headerClassName)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border/60 last:border-0 transition-colors duration-150 ease-out-quart',
                onRowClick ? 'cursor-pointer hover:bg-accent/40' : 'hover:bg-accent/20',
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
