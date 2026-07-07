import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Checkbox } from '@/components/ui/checkbox'
import { useCreateProject, useProjects, useUpdateProject, useUsers } from '../api/hooks'
import type { Project } from '../api/types'
import { useSpace } from '../components/Shell'
import { StatusBadge, useStatusDefs } from '../components/statuses'
import { TagChip } from '../components/tags'
import { Avatar, Button, Empty, Field, fmtDate, inputCls, Modal, Pick, SegmentedToggle } from '../components/ui'

const DAY = 86_400_000
const today = () => new Date(new Date().toDateString()).getTime()
const ts = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').getTime()

export function Projects() {
  const { space } = useSpace()
  const [showArchived, setShowArchived] = useState(false)
  const projects = useProjects(space.id, showArchived)
  const [view, setView] = useState<'list' | 'timeline'>(
    () => (localStorage.getItem('cortex.projview') as 'list' | 'timeline') || 'list',
  )
  const [creating, setCreating] = useState(false)
  const [tagFilter, setTagFilter] = useState<string[]>([])

  const all = projects.data ?? []
  const vocab = useMemo(
    () => [...new Set((projects.data ?? []).flatMap((p) => p.tags))].sort(),
    [projects.data],
  )
  // AND semantics: every selected tag must be present
  const items = tagFilter.length ? all.filter((p) => tagFilter.every((t) => p.tags.includes(t))) : all
  const toggleTag = (t: string) =>
    setTagFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]))

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-xl font-bold">Projects</h1>
        <span className="font-mono text-[11px] text-ink-faint mt-0.5">{items.length}</span>
        {vocab.length > 0 && (
          <span className="flex items-center gap-1.5 ml-3">
            {vocab.map((t) => (
              <TagChip key={t} tag={t} active={tagFilter.includes(t)} onClick={() => toggleTag(t)} />
            ))}
          </span>
        )}
        <div className="flex-1" />
        <label className="text-xs text-ink-dim flex items-center gap-1.5 mr-2 cursor-pointer">
          <Checkbox checked={showArchived} onCheckedChange={(c) => setShowArchived(c === true)} />
          archived
        </label>
        <SegmentedToggle
          value={view}
          onChange={(v) => { setView(v); localStorage.setItem('cortex.projview', v) }}
          options={[{ value: 'list', label: 'List' }, { value: 'timeline', label: 'Timeline' }]}
        />
        <Button kind="primary" onClick={() => setCreating(true)}>
          <Plus /> Project
        </Button>
      </div>

      {!items.length && <Empty>No projects in {space.name} yet.</Empty>}
      {items.length > 0 && (view === 'list'
        ? <div className="max-w-5xl mx-auto"><List projects={items} onTagClick={toggleTag} /></div>
        : <Timeline projects={items.filter((p) => p.due_date)} />)}

      <NewProjectModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function List({ projects, onTagClick }: { projects: Project[]; onTagClick: (t: string) => void }) {
  const users = useUsers()
  const { list: statuses } = useStatusDefs('project')
  const update = useUpdateProject()

  const group = (ps: Project[]) => {
    const by: Record<string, Project[]> = {}
    for (const s of statuses) by[s.key] = []
    for (const p of ps) (by[p.status] ??= []).push(p)
    return by
  }
  // local column state so drag-to-another-status feels instant (see board DnD note)
  const [cols, setCols] = useState<Record<string, Project[]>>(() => group(projects))
  useEffect(() => { setCols(group(projects)) }, [projects, statuses]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDragEnd = ({ source, destination }: DropResult) => {
    if (!destination || source.droppableId === destination.droppableId) return
    const from = source.droppableId
    const to = destination.droppableId
    const proj = cols[from]?.[source.index]
    if (!proj) return
    const next: Record<string, Project[]> = {}
    for (const k in cols) next[k] = [...cols[k]]
    next[from].splice(source.index, 1)
    ;(next[to] ??= []).splice(destination.index, 0, { ...proj, status: to })
    setCols(next)
    update.mutate({ id: proj.id, status: to })
  }

  const rowInner = (p: Project) => {
    const overdue = p.due_date != null && ts(p.due_date) < today() && p.open_tasks > 0
    const done = p.total_tasks - p.open_tasks
    const owner = users.data?.find((u) => u.id === p.owner_id)
    return (
      <Link to={`/projects/${p.id}`} draggable={false}
            className="flex items-center gap-3 px-3 py-2.5 bg-panel hover:bg-raised transition-colors">
        {owner
          ? <Avatar name={owner.username} size={20} />
          : <span className="size-5 shrink-0 rounded-full border border-dashed border-line-strong" title="No owner" />}
        <span className={`text-sm font-medium truncate ${p.archived ? 'text-ink-faint line-through' : ''}`}>
          {p.title}
        </span>
        <span className="flex-1 flex items-center gap-1 min-w-0">
          {p.tags.map((t) => <TagChip key={t} tag={t} onClick={() => onTagClick(t)} />)}
        </span>
        {p.total_tasks > 0 && (
          <span className="flex items-center gap-2 text-xs text-ink-dim font-mono">
            {done}/{p.total_tasks}
            <span className="w-20 h-1.5 rounded-full bg-line overflow-hidden">
              <span className="block h-full bg-brand rounded-full"
                    style={{ width: `${(done / p.total_tasks) * 100}%` }} />
            </span>
          </span>
        )}
        {p.due_date && (
          <span className={`text-xs font-mono whitespace-nowrap ${overdue ? 'text-prio-urgent font-medium' : 'text-ink-faint'}`}>
            due {fmtDate(p.due_date)}
          </span>
        )}
      </Link>
    )
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="space-y-5">
        {statuses.map((s) => (
          <div key={s.key}>
            <div className="flex items-center gap-2 mb-1.5 px-1">
              <StatusBadge def={s} />
              <span className="font-mono text-xs text-ink-faint">{(cols[s.key] ?? []).length}</span>
            </div>
            <Droppable droppableId={s.key}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-lg border divide-y divide-line overflow-hidden transition-colors ${
                    snapshot.isDraggingOver ? 'border-brand/40 bg-brand-soft/10' : 'border-line'
                  } ${(cols[s.key] ?? []).length ? '' : 'min-h-11 grid place-items-center'}`}
                >
                  {(cols[s.key] ?? []).map((p, i) => (
                    <Draggable draggableId={String(p.id)} index={i} key={p.id}>
                      {(pr) => (
                        <div ref={pr.innerRef} {...pr.draggableProps} {...pr.dragHandleProps}>
                          {rowInner(p)}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {!(cols[s.key] ?? []).length && !snapshot.isDraggingOver && (
                    <span className="text-xs text-ink-faint py-2">drop here</span>
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  )
}

// ---------------------------------------------------------------- timeline

const pad = (n: number) => String(n).padStart(2, '0')
const isoLocal = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Scale = 'weeks' | 'months'
type Drag = { id: number; edge: 'start' | 'end'; x: number; s: number; e: number }

function Timeline({ projects }: { projects: Project[] }) {
  const update = useUpdateProject()
  const [scale, setScale] = useState<Scale>(
    () => (localStorage.getItem('cortex.tlscale') as Scale) || 'months',
  )
  const pxPerDay = scale === 'weeks' ? 20 : 6

  // live overrides while dragging a bar edge; committed to the server on release
  const [override, setOverride] = useState<Record<number, { start: number; end: number }>>({})
  const overrideRef = useRef(override)
  overrideRef.current = override
  const drag = useRef<Drag | null>(null)

  // callers pass only dated projects (due_date filtered upstream)
  const dates = (p: Project) =>
    override[p.id] ?? { start: ts(p.start_date ?? p.created_at.slice(0, 10)), end: ts(p.due_date!) }

  // stable vertical order (earliest start first) so bars don't jump after an edit
  const ordered = useMemo(
    () => [...projects].sort((a, b) =>
      ts(a.start_date ?? a.created_at.slice(0, 10)) - ts(b.start_date ?? b.created_at.slice(0, 10)) || a.id - b.id),
    [projects],
  )

  // measure the visible width so the timeline always spans at least the screen,
  // showing future months even when projects only occupy a couple of months
  const scrollHost = useRef<HTMLDivElement>(null)
  const [hostW, setHostW] = useState(0)
  useEffect(() => {
    const el = scrollHost.current
    if (!el) return
    const ro = new ResizeObserver(() => setHostW(el.clientWidth))
    ro.observe(el)
    setHostW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const { min, baseMax } = useMemo(() => {
    const starts = projects.map((p) => ts(p.start_date ?? p.created_at.slice(0, 10)))
    const ends = projects.map((p) => ts(p.due_date!))
    return { min: Math.min(...starts, today()) - 7 * DAY, baseMax: Math.max(...ends, today()) + 14 * DAY }
  }, [projects])

  const neededDays = hostW > 0 ? Math.ceil((hostW - 32) / pxPerDay) : 0
  const max = Math.max(baseMax, min + neededDays * DAY)

  const x = (t: number) => ((t - min) / DAY) * pxPerDay
  const totalW = ((max - min) / DAY) * pxPerDay

  const ticks = useMemo(() => {
    const out: { t: number; label: string; major: boolean }[] = []
    const d = new Date(min)
    if (scale === 'months') {
      d.setDate(1)
      while (d.getTime() <= max) {
        if (d.getTime() >= min)
          out.push({ t: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short' }), major: true })
        d.setMonth(d.getMonth() + 1)
      }
    } else {
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7)) // advance to Monday
      while (d.getTime() <= max) {
        out.push({ t: d.getTime(), label: `${d.getMonth() + 1}/${d.getDate()}`, major: d.getDate() <= 7 })
        d.setDate(d.getDate() + 7)
      }
    }
    return out
  }, [min, max, scale])

  // global drag listeners
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      const delta = Math.round((e.clientX - d.x) / pxPerDay) * DAY
      const start = d.edge === 'start' ? Math.min(d.s + delta, d.e) : d.s
      const end = d.edge === 'end' ? Math.max(d.e + delta, d.s) : d.e
      setOverride((o) => ({ ...o, [d.id]: { start, end } }))
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      const cur = overrideRef.current[d.id]
      if (cur) update.mutate({ id: d.id, start_date: isoLocal(cur.start), due_date: isoLocal(cur.end) })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [pxPerDay, update])

  // once the server data reflects the change, drop the local overrides
  useEffect(() => { setOverride({}) }, [projects])

  const startDrag = (e: React.MouseEvent, p: Project, edge: 'start' | 'end') => {
    e.preventDefault()
    e.stopPropagation()
    const { start, end } = dates(p)
    drag.current = { id: p.id, edge, x: e.clientX, s: start, e: end }
  }

  return (
    <div className="border border-line rounded-lg bg-panel">
      <div className="flex items-center justify-end px-3 py-2 border-b border-line">
        <SegmentedToggle
          value={scale}
          onChange={(v) => { setScale(v); localStorage.setItem('cortex.tlscale', v) }}
          options={[{ value: 'weeks', label: 'Weeks' }, { value: 'months', label: 'Months' }]}
        />
      </div>
      <div ref={scrollHost} className="p-4 overflow-x-auto">
        <div className="relative" style={{ width: totalW, minWidth: '100%', height: 28 + projects.length * 34 }}>
          {/* grid */}
          {ticks.map((m) => (
            <div key={m.t} className="absolute top-0 bottom-0" style={{ left: x(m.t) }}>
              <div className={`w-px h-full ${m.major ? 'bg-line-strong' : 'bg-line'}`} />
              <span className="absolute top-0 left-1.5 font-mono text-[10px] uppercase text-ink-faint whitespace-nowrap">
                {m.label}
              </span>
            </div>
          ))}
          {/* today */}
          <div className="absolute top-0 bottom-0 z-10" style={{ left: x(today()) }}>
            <div className="w-px h-full bg-brand" />
            <span className="absolute top-0 -translate-x-1/2 -mt-0.5 size-1.5 rounded-full bg-brand" />
          </div>
          {/* bars */}
          {ordered.map((p, i) => {
            const { start, end } = dates(p)
            const overdue = end < today() && p.open_tasks > 0
            const left = x(start)
            const width = Math.max((end - start) / DAY, 0.5) * pxPerDay + pxPerDay
            return (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="group absolute h-6 rounded-md flex items-center px-2 text-xs font-medium text-panel truncate hover:brightness-110 transition-[filter]"
                style={{
                  top: 28 + i * 34,
                  left,
                  width,
                  background: overdue ? 'var(--color-prio-urgent)' : p.archived ? 'var(--color-ink-faint)' : 'var(--color-brand)',
                }}
                title={`${p.title} · ${fmtDate(isoLocal(start))} → ${fmtDate(isoLocal(end))}`}
              >
                <span
                  onMouseDown={(e) => startDrag(e, p, 'start')}
                  onClick={(e) => e.preventDefault()}
                  className="absolute left-0 inset-y-0 w-2 cursor-ew-resize rounded-l-md opacity-0 group-hover:opacity-100 bg-black/20"
                  title="Drag to change start"
                />
                <span className="truncate pointer-events-none">{p.title}</span>
                <span
                  onMouseDown={(e) => startDrag(e, p, 'end')}
                  onClick={(e) => e.preventDefault()}
                  className="absolute right-0 inset-y-0 w-2 cursor-ew-resize rounded-r-md opacity-0 group-hover:opacity-100 bg-black/20"
                  title="Drag to change due date"
                />
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { space } = useSpace()
  const create = useCreateProject()
  const users = useUsers()
  const { list: projStatuses } = useStatusDefs('project')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [start, setStart] = useState('')
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState('')

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!title.trim()) return
          await create.mutateAsync({
            space_id: space.id,
            title: title.trim(),
            due_date: due || undefined,
            start_date: start || undefined,
            owner_id: owner ? Number(owner) : null,
            status: status || undefined,
          })
          setTitle(''); setDue(''); setStart(''); setOwner(''); setStatus('')
          onClose()
        }}
        className="space-y-3"
      >
        <input autoFocus className={inputCls} placeholder="Project title" value={title}
               onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts (optional)">
            <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Due (optional for ongoing)">
            <input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Status">
            <Pick
              value={status || null}
              placeholder={projStatuses[0]?.label ?? '—'}
              onChange={setStatus}
              options={projStatuses.map((s) => ({ value: s.key, label: s.label }))}
            />
          </Field>
          <Field label="Owner (optional)">
            <Pick
              value={owner || null}
              placeholder="Unassigned"
              onChange={setOwner}
              options={users.data?.filter((u) => u.is_active)
                .map((u) => ({ value: String(u.id), label: u.username })) ?? []}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button kind="primary" type="submit" disabled={!title.trim()}>Create project</Button>
        </div>
      </form>
    </Modal>
  )
}
