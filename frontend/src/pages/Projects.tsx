import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { bucketBy } from '@/lib/utils'
import { useCreateProject, useDeleteProject, useProjects, useUpdateProject, useUsers } from '../api/hooks'
import type { Project } from '../api/types'
import { FilterMenu, useListFilters, useVisibleProjects } from '../components/filters'
import { useSpace } from '../components/Shell'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StatusBadge, useStatusDefs } from '../components/statuses'
import { TagChip } from '../components/tags'
import { ActionBar, actionTriggerCls, PersonMenu, PrioMenu, SelectBox, useSelection, type Selection } from '../components/TaskBits'
import {
  Avatar, Button, Empty, Field, fmtDate, inputCls, Modal, Pick, PRIORITIES, PrioDot, projectHue,
  RowAccent, rowCls, rowHoverCls, SegmentedToggle,
} from '../components/ui'

type ProjGroup = 'none' | 'status' | 'tag' | 'user'

const DAY = 86_400_000
const today = () => new Date(new Date().toDateString()).getTime()
const ts = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').getTime()

export function Projects() {
  const { space } = useSpace()
  const { showArchived } = useListFilters()
  const projects = useProjects(space.id, showArchived)
  const [view, setView] = useState<'list' | 'timeline'>(
    () => (localStorage.getItem('cortex.projview') as 'list' | 'timeline') || 'list',
  )
  const [group, setGroup] = useState<ProjGroup>(
    () => (localStorage.getItem('cortex.projgroup') as ProjGroup) || 'status',
  )
  const [creating, setCreating] = useState(false)
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const selection = useSelection()

  const all = useVisibleProjects(projects.data ?? [])
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
        <h1 className="font-heading font-normal italic text-[1.7rem]">Projects</h1>
        <span className="font-mono text-[11px] text-ink-faint mt-0.5">{items.length}</span>
        {vocab.length > 0 && (
          <span className="flex items-center gap-1.5 ml-3">
            {vocab.map((t) => (
              <TagChip key={t} tag={t} active={tagFilter.includes(t)} onClick={() => toggleTag(t)} />
            ))}
          </span>
        )}
        <div className="flex-1" />
        <FilterMenu archived empty users />
        <SegmentedToggle
          value={group}
          onChange={(v) => { setGroup(v); localStorage.setItem('cortex.projgroup', v) }}
          options={[
            { value: 'none', label: 'None' },
            { value: 'status', label: 'Status' },
            { value: 'tag', label: 'Tag' },
            { value: 'user', label: 'User' },
          ]}
        />
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
        ? <div><List projects={items} groupBy={group} onTagClick={toggleTag} selection={selection} /></div>
        : <Timeline projects={items.filter((p) => p.due_date || p.start_date)} groupBy={group} />)}

      <ProjectBar selection={selection} />
      <NewProjectModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function List({ projects, groupBy, onTagClick, selection }: {
  projects: Project[]
  groupBy: ProjGroup
  onTagClick: (t: string) => void
  selection: Selection
}) {
  const users = useUsers()
  const { list: statuses } = useStatusDefs('project')
  const { showDone } = useListFilters()
  const sections = statuses.filter((s) => showDone || !s.is_done)
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

  const selecting = selection.selected.size > 0
  const rowInner = (p: Project, orderedIds: number[]) => {
    const overdue = p.due_date != null && ts(p.due_date) < today() && p.open_tasks > 0
    const done = p.total_tasks - p.open_tasks
    const nextMs = p.milestones.find((m) => ts(m.date) >= today()) // server keeps them date-sorted
    return (
      <Link
        to={`/projects/${p.id}`}
        draggable={false}
        onClick={(e) => {
          if (e.shiftKey) { e.preventDefault(); selection.selectRange(p.id, orderedIds) }
          else if (e.metaKey || e.ctrlKey || selecting) { e.preventDefault(); selection.toggle(p.id) }
        }}
        className={`${rowCls} ${
          selection.isSelected(p.id) ? 'bg-brand-soft/60' : rowHoverCls
        } gap-3 pl-4 pr-3 py-2 select-none`}
      >
        <RowAccent color={`hsl(${projectHue(p.id)} 70% 60%)`} />
        <SelectBox id={p.id} selection={selection} orderedIds={orderedIds} />
        {/* inside a Link: cancel navigation in capture phase — the trigger's own
            handler stops propagation, so a bubble-phase preventDefault never runs */}
        <span onClickCapture={(e) => e.preventDefault()} className="shrink-0 grid place-items-center">
          <PersonMenu
            currentId={p.owner_id}
            size={20}
            clearLabel="No owner"
            verb="Set owner"
            onPick={(owner_id) => update.mutate({ id: p.id, owner_id })}
          />
        </span>
        <span onClickCapture={(e) => e.preventDefault()} className="shrink-0 grid place-items-center">
          <PrioMenu
            current={p.priority}
            onPick={(priority) => update.mutate({ id: p.id, priority })}
          />
        </span>
        <span className={`text-[1.02rem] font-medium truncate ${p.archived ? 'text-ink-faint' : ''}`}>
          {p.title}
        </span>
        <span className="flex-1 flex items-center gap-1 min-w-0">
          {p.tags.map((t) => <TagChip key={t} tag={t} onClick={() => onTagClick(t)} />)}
        </span>
        {nextMs && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-md px-1.5 py-px bg-brand-soft text-brand whitespace-nowrap"
                title="next milestone">
            <span className="size-1.5 rotate-45 bg-brand shrink-0" />
            <span className="font-mono">{fmtDate(nextMs.date)}</span>
            <span className="truncate max-w-40">{nextMs.title}</span>
          </span>
        )}
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

  if (groupBy === 'none') {
    return (
      <div className="flex flex-col gap-0.5">
        {projects.map((p) => <div key={p.id}>{rowInner(p, projects.map((x) => x.id))}</div>)}
      </div>
    )
  }

  // user and tag grouping are static lists (no drag-into-group semantics)
  if (groupBy === 'user' || groupBy === 'tag') {
    const groups = groupBy === 'user'
      ? bucketBy(projects, (p) => p.owner_id, (users.data ?? []).map((u) => u.id)).map(([id, items]) => {
          const u = users.data?.find((x) => x.id === id)
          return {
            key: u ? `u${u.id}` : 'none',
            header: u
              ? (<><Avatar name={u.username} size={18} /><span className="text-sm font-semibold">{u.username}</span></>)
              : <span className="text-sm font-semibold text-ink-dim">No owner</span>,
            items,
          }
        })
      : bucketBy(projects, (p) => p.tags[0] ?? null).map(([tag, items]) => ({
          key: tag ?? 'none',
          header: tag
            ? <TagChip tag={tag} onClick={() => onTagClick(tag)} />
            : <span className="text-sm font-semibold text-ink-dim">No tag</span>,
          items,
        }))
    return (
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="flex items-center gap-2 mb-1.5 px-1">
              {g.header}
              <span className="font-mono text-xs text-ink-faint">{g.items.length}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {g.items.map((p) => <div key={p.id}>{rowInner(p, groups.flatMap((x) => x.items.map((i) => i.id)))}</div>)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="space-y-5">
        {sections.map((s) => (
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
                  className={`flex flex-col gap-0.5 rounded-lg transition-colors ${
                    snapshot.isDraggingOver ? 'bg-brand-soft/30' : ''
                  } ${(cols[s.key] ?? []).length ? '' : 'min-h-11 grid place-items-center'}`}
                >
                  {(cols[s.key] ?? []).map((p, i) => (
                    <Draggable draggableId={String(p.id)} index={i} key={p.id}>
                      {(pr) => (
                        <div ref={pr.innerRef} {...pr.draggableProps} {...pr.dragHandleProps}>
                          {rowInner(p, sections.flatMap((x) => (cols[x.key] ?? []).map((i) => i.id)))}
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

/** Bulk actions for selected projects: status, priority, owner, archive, delete. */
function ProjectBar({ selection }: { selection: Selection }) {
  const { list: statuses } = useStatusDefs('project')
  const users = useUsers()
  const update = useUpdateProject()
  const del = useDeleteProject()
  const ids = [...selection.selected]
  const apply = async (patch: Partial<Project>) => {
    await Promise.all(ids.map((id) => update.mutateAsync({ id, ...patch })))
    selection.clear()
  }
  return (
    <ActionBar selection={selection}>
      <DropdownMenu>
        <DropdownMenuTrigger className={actionTriggerCls}>Status…</DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {statuses.map((s) => (
            <DropdownMenuItem key={s.key} onClick={() => apply({ status: s.key })}>
              <StatusBadge def={s} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger className={actionTriggerCls}>Priority…</DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {PRIORITIES.map((p) => (
            <DropdownMenuItem key={p} onClick={() => apply({ priority: p })}>
              <PrioDot priority={p} />
              {p}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger className={actionTriggerCls}>Owner…</DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {users.data?.filter((u) => u.is_active).map((u) => (
            <DropdownMenuItem key={u.id} onClick={() => apply({ owner_id: u.id })}>
              <Avatar name={u.username} size={16} />
              {u.username}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" onClick={() => apply({ archived: true })}>Archive</Button>
      <Button
        kind="danger"
        size="sm"
        onClick={async () => {
          const n = ids.length
          if (!confirm(`Delete ${n} project${n === 1 ? '' : 's'}? Their tasks will stay, detached. This cannot be undone.`)) return
          await Promise.all(ids.map((id) => del.mutateAsync(id)))
          selection.clear()
        }}
      >
        Delete
      </Button>
    </ActionBar>
  )
}

// ---------------------------------------------------------------- timeline

const pad = (n: number) => String(n).padStart(2, '0')
const isoLocal = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Scale = 'weeks' | 'months'
// e is null for open-ended projects (no due date): only the start edge drags
type Drag = { id: number; edge: 'start' | 'end'; x: number; s: number; e: number | null }

const TL_HEADER_H = 24
const TL_ROW_H = 34
const TL_GROUP_GAP = 14
const TL_TOP = 28 // space reserved for the month/week tick labels

function Timeline({ projects, groupBy }: { projects: Project[]; groupBy: ProjGroup }) {
  const update = useUpdateProject()
  const users = useUsers()
  const { list: statuses } = useStatusDefs('project')
  const [scale, setScale] = useState<Scale>(
    () => (localStorage.getItem('cortex.tlscale') as Scale) || 'months',
  )
  const pxPerDay = scale === 'weeks' ? 20 : 6

  // live overrides while dragging a bar edge; committed to the server on release
  const [override, setOverride] = useState<Record<number, { start: number; end: number | null }>>({})
  const overrideRef = useRef(override)
  overrideRef.current = override
  const drag = useRef<Drag | null>(null)

  // callers pass only projects with a due or start date; end is null when open-ended
  const dates = (p: Project) =>
    override[p.id] ?? {
      start: ts(p.start_date ?? p.created_at.slice(0, 10)),
      end: p.due_date ? ts(p.due_date) : null,
    }

  const byStart = (a: Project, b: Project) =>
    ts(a.start_date ?? a.created_at.slice(0, 10)) - ts(b.start_date ?? b.created_at.slice(0, 10)) || a.id - b.id

  // group into swimlanes (earliest start first within each), then flatten with
  // computed vertical offsets — a header row per group, a row per project
  const { rows, headers, totalH } = useMemo(() => {
    type Bucket = { key: string; label: React.ReactNode | null; items: Project[] }
    let buckets: Bucket[]
    if (groupBy === 'none') {
      buckets = [{ key: 'all', label: null, items: projects }]
    } else if (groupBy === 'status') {
      buckets = bucketBy(projects, (p) => p.status, statuses.map((s) => s.key)).map(([key, items]) => {
        const s = statuses.find((x) => x.key === key)!
        return { key: s.key, label: <StatusBadge def={s} />, items }
      })
    } else if (groupBy === 'tag') {
      buckets = bucketBy(projects, (p) => p.tags[0] ?? null).map(([tag, items]) => ({
        key: tag ?? 'none',
        label: tag ? <TagChip tag={tag} /> : <span className="text-sm font-semibold text-ink-dim">No tag</span>,
        items,
      }))
    } else {
      buckets = bucketBy(projects, (p) => p.owner_id, (users.data ?? []).map((u) => u.id)).map(([id, items]) => {
        const u = users.data?.find((x) => x.id === id)
        return {
          key: u ? `u${u.id}` : 'none',
          label: u
            ? <span className="inline-flex items-center gap-1.5"><Avatar name={u.username} size={16} />{u.username}</span>
            : <span className="text-sm font-semibold text-ink-dim">No owner</span>,
          items,
        }
      })
    }

    let y = TL_TOP
    const rowsOut: { p: Project; top: number }[] = []
    const headersOut: { key: string; label: React.ReactNode; top: number }[] = []
    for (const b of buckets) {
      if (b.label != null) {
        headersOut.push({ key: b.key, label: b.label, top: y })
        y += TL_HEADER_H
      }
      for (const p of [...b.items].sort(byStart)) { rowsOut.push({ p, top: y }); y += TL_ROW_H }
      y += TL_GROUP_GAP
    }
    return { rows: rowsOut, headers: headersOut, totalH: Math.max(y - TL_GROUP_GAP, TL_TOP) }
  }, [projects, groupBy, statuses, users.data])

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
    const ends = projects.filter((p) => p.due_date).map((p) => ts(p.due_date!))
    const ms = projects.flatMap((p) => p.milestones.map((m) => ts(m.date)))
    return {
      min: Math.min(...starts, today()) - 7 * DAY,
      baseMax: Math.max(...ends, ...ms, today()) + 14 * DAY,
    }
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
      const start = d.edge === 'start' ? (d.e == null ? d.s + delta : Math.min(d.s + delta, d.e)) : d.s
      const end = d.edge === 'end' && d.e != null ? Math.max(d.e + delta, d.s) : d.e
      setOverride((o) => ({ ...o, [d.id]: { start, end } }))
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      const cur = overrideRef.current[d.id]
      if (cur) update.mutate({
        id: d.id, start_date: isoLocal(cur.start),
        ...(cur.end != null && { due_date: isoLocal(cur.end) }),
      })
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
      <div className="flex">
        {/* sticky group labels — not part of the horizontally-scrolling area */}
        {headers.length > 0 && (
          <div className="w-40 shrink-0 border-r border-line p-4">
            <div className="relative" style={{ height: totalH }}>
              {headers.map((h) => (
                <div key={h.key} className="absolute left-0 right-2 flex items-center h-6 text-sm truncate" style={{ top: h.top }}>
                  {h.label}
                </div>
              ))}
            </div>
          </div>
        )}
        <div ref={scrollHost} className="flex-1 p-4 overflow-x-auto">
        <div className="relative" style={{ width: totalW, minWidth: '100%', height: totalH }}>
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
          {rows.map(({ p, top }) => {
            const { start, end } = dates(p)
            const overdue = end != null && end < today() && p.open_tasks > 0
            const left = x(start)
            // open-ended bars fade out instead of ending; run to today + 2 weeks,
            // or past the last milestone if one is further out
            const lastMs = Math.max(0, ...p.milestones.map((m) => ts(m.date)))
            const drawEnd = end ?? Math.max(today(), start, lastMs) + 14 * DAY
            const width = Math.max((drawEnd - start) / DAY, 0.5) * pxPerDay + pxPerDay
            const color = overdue ? 'var(--color-prio-urgent)'
              : p.archived ? 'var(--color-ink-faint)' : 'var(--color-brand)'
            return (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="group absolute h-6 rounded-md flex items-center px-2 text-xs font-medium text-panel truncate hover:brightness-110 transition-[filter]"
                style={{
                  top,
                  left,
                  width,
                  background: end == null
                    ? `linear-gradient(to right, ${color} 55%, transparent)`
                    : color,
                }}
                title={`${p.title} · ${fmtDate(isoLocal(start))} → ${end == null ? 'ongoing' : fmtDate(isoLocal(end))}`}
              >
                <span
                  onMouseDown={(e) => startDrag(e, p, 'start')}
                  onClick={(e) => e.preventDefault()}
                  className="absolute left-0 inset-y-0 w-2 cursor-ew-resize rounded-l-md opacity-0 group-hover:opacity-100 bg-black/20"
                  title="Drag to change start"
                />
                <span className="truncate pointer-events-none">{p.title}</span>
                {end != null && (
                  <span
                    onMouseDown={(e) => startDrag(e, p, 'end')}
                    onClick={(e) => e.preventDefault()}
                    className="absolute right-0 inset-y-0 w-2 cursor-ew-resize rounded-r-md opacity-0 group-hover:opacity-100 bg-black/20"
                    title="Drag to change due date"
                  />
                )}
              </Link>
            )
          })}
          {/* milestone diamonds, over the bars */}
          {rows.flatMap(({ p, top }) =>
            p.milestones.map((m) => (
              <span
                key={`${p.id}-${m.date}-${m.title}`}
                className="absolute z-10 size-2.5 rotate-45 rounded-[2px] bg-panel border-2 border-brand"
                style={{ top: top + 7, left: x(ts(m.date)) - 5 }}
                title={`${m.title} · ${fmtDate(m.date)}`}
              />
            )),
          )}
        </div>
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
  const [priority, setPriority] = useState('medium')

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
            priority,
          })
          setTitle(''); setDue(''); setStart(''); setOwner(''); setStatus(''); setPriority('medium')
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
        <div className="grid grid-cols-3 gap-2">
          <Field label="Status">
            <Pick
              value={status || null}
              placeholder={projStatuses[0]?.label ?? '—'}
              onChange={setStatus}
              options={projStatuses.map((s) => ({ value: s.key, label: s.label }))}
            />
          </Field>
          <Field label="Priority">
            <Pick
              value={priority}
              onChange={setPriority}
              options={PRIORITIES.map((p) => ({
                value: p,
                label: <span className="flex items-center gap-1.5"><PrioDot priority={p} /> {p}</span>,
              }))}
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
