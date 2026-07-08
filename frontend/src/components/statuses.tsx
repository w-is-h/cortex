import { useMemo } from 'react'
import { useStatuses } from '../api/hooks'
import type { StatusDef } from '../api/types'
import { useSpace } from './Shell'

/** Per-space status definitions for the active space, plus quick lookups. */
export function useStatusDefs(kind: 'task' | 'project') {
  const { space } = useSpace()
  const q = useStatuses(space.id, kind)
  const list = useMemo(() => q.data ?? [], [q.data])
  const byKey = useMemo(() => {
    const m: Record<string, StatusDef> = {}
    for (const s of list) m[s.key] = s
    return m
  }, [list])
  const doneKeys = useMemo(() => new Set(list.filter((s) => s.is_done).map((s) => s.key)), [list])
  return { list, byKey, doneKeys, isPending: q.isPending }
}

export function StatusDot({ def, className = '' }: { def?: StatusDef; className?: string }) {
  return (
    <span
      title={def?.label}
      className={`inline-block size-2 rounded-full shrink-0 ${className}`}
      style={{ background: def?.color ?? 'var(--color-ink-faint)' }}
    />
  )
}

/** Small colored pill for a task/project status. */
export function StatusBadge({ def, dim }: { def?: StatusDef; dim?: boolean }) {
  if (!def) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap"
      style={{
        color: def.color,
        background: `color-mix(in oklab, ${def.color} ${dim ? 14 : 22}%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: def.color }} />
      {def.label}
    </span>
  )
}
