import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useSearch } from '../api/hooks'
import { useSpace } from './Shell'
import { StatusBadge, useStatusDefs } from './statuses'
import { Pick, PrioDot } from './ui'

/** Escape user content but keep the <mark> tags FTS snippets add. */
function safeSnippet(s: string): string {
  return s
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('&lt;mark&gt;', '<mark>').replaceAll('&lt;/mark&gt;', '</mark>')
}

interface Row {
  key: string
  section: 'Tasks' | 'Projects' | 'Comments'
  title: string
  snippet: string
  to: string
  extra?: React.ReactNode
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space } = useSpace()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [kind, setKind] = useState<'all' | 'task' | 'project' | 'comment'>('all')
  const [status, setStatus] = useState('')
  const [images, setImages] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 120)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (open) {
      setQ(''); setDebounced(''); setKind('all'); setStatus(''); setImages(false)
    }
  }, [open])

  const results = useSearch(debounced, space.id, {
    kind: kind === 'all' ? undefined : kind,
    status: status || undefined,
    hasImages: images,
  })
  const { byKey, list: taskStatuses } = useStatusDefs('task')

  const rows: Row[] = useMemo(() => {
    if (!results.data) return []
    const r: Row[] = []
    for (const t of results.data.tasks)
      r.push({
        key: `t${t.id}`, section: 'Tasks', title: t.title, snippet: t.snippet,
        to: `/tasks/${t.id}`,
        extra: (
          <span className="flex items-center gap-1.5 shrink-0">
            <PrioDot priority={t.priority} />
            <StatusBadge def={byKey[t.status]} />
          </span>
        ),
      })
    for (const p of results.data.projects)
      r.push({
        key: `p${p.id}`, section: 'Projects', title: p.title, snippet: p.snippet,
        to: `/projects/${p.id}`,
        extra: <span className="text-xs text-ink-faint font-mono shrink-0">due {p.due_date}</span>,
      })
    for (const c of results.data.comments)
      r.push({
        key: `c${c.id}`, section: 'Comments',
        title: `${c.author_username} on ${c.parent_title}`, snippet: c.snippet,
        to: c.parent_type === 'task' ? `/tasks/${c.parent_id}` : `/projects/${c.parent_id}`,
      })
    return r
  }, [results.data, byKey])

  const sections = ['Tasks', 'Projects', 'Comments'] as const

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="p-0 overflow-hidden sm:max-w-xl top-[22%] translate-y-0">
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            placeholder={`Search ${space.name}…`}
            value={q}
            onValueChange={setQ}
          />
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-line text-xs">
            {(['all', 'task', 'project', 'comment'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-full px-2 py-0.5 font-medium capitalize transition-colors ${
                  kind === k ? 'bg-brand-soft text-brand' : 'text-ink-dim hover:text-ink'
                }`}
              >
                {k === 'all' ? 'All' : `${k}s`}
              </button>
            ))}
            <span className="flex-1" />
            <button
              onClick={() => setImages((v) => !v)}
              title="Only results with images"
              className={`rounded-full px-2 py-0.5 font-medium whitespace-nowrap transition-colors ${
                images ? 'bg-brand-soft text-brand' : 'text-ink-dim hover:text-ink'
              }`}
            >
              has images
            </button>
            {kind !== 'project' && kind !== 'comment' && (
              <Pick
                size="sm"
                value={status || 'any'}
                onChange={(v) => setStatus(v === 'any' ? '' : v)}
                options={[{ value: 'any', label: 'Any status' },
                  ...taskStatuses.map((s) => ({ value: s.key, label: s.label }))]}
              />
            )}
          </div>
          <CommandList className="max-h-[50vh]">
            {debounced && !results.isPending && <CommandEmpty>No matches.</CommandEmpty>}
            {sections.map((section) => {
              const items = rows.filter((r) => r.section === section)
              if (!items.length) return null
              return (
                <CommandGroup key={section} heading={section}>
                  {items.map((row) => (
                    <CommandItem
                      key={row.key}
                      value={row.key}
                      onSelect={() => {
                        onClose()
                        navigate(row.to)
                      }}
                      className="flex items-center gap-3"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{row.title}</span>
                        <span
                          className="snippet block text-xs text-ink-dim truncate"
                          dangerouslySetInnerHTML={{ __html: safeSnippet(row.snippet) }}
                        />
                      </span>
                      {row.extra}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
          <div className="px-3 py-1.5 border-t border-line flex gap-3 text-[11px] text-ink-faint">
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>↵</kbd> open</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
