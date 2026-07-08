import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMyTasks, useNotifications, useProjects, useSprints, useTasks, useUpdateTask } from '../api/hooks'
import type { Sprint, Task } from '../api/types'
import { useSpace } from '../components/Shell'
import { StatusBadge, useStatusDefs } from '../components/statuses'
import { Avatar, fmtDate, timeAgo } from '../components/ui'
import { MoveBar, TaskRow, TaskTable, useSelection, type Selection } from '../components/TaskBits'

const NOTE: Record<string, string> = {
  assigned: 'assigned you',
  status_changed: 'moved',
  commented: 'commented on',
  mentioned: 'mentioned you in',
}

export function Home() {
  const { me, space } = useSpace()
  const tasks = useMyTasks()
  const sprints = useSprints(space.id)
  const selection = useSelection()

  const current = (sprints.data ?? []).find((s) => s.is_current)
  // projects that have at least one task in the current sprint
  const sprintTasks = useTasks({ space_id: space.id, sprint_id: current?.id }, { enabled: !!current })
  const activeProjectIds = useMemo(
    () => new Set((sprintTasks.data ?? []).map((t) => t.project_id).filter((id): id is number => id != null)),
    [sprintTasks.data],
  )

  const groups = useMemo(() => {
    const all = tasks.data ?? []
    const currentIds = new Set((sprints.data ?? []).filter((s) => s.is_current).map((s) => s.id))
    return {
      current: all.filter((t) => t.sprint_id !== null && currentIds.has(t.sprint_id)),
      older: all.filter((t) => t.sprint_id !== null && !currentIds.has(t.sprint_id)),
      backlog: all.filter((t) => t.sprint_id === null),
    }
  }, [tasks.data, sprints.data])

  if (tasks.isPending) return null
  const empty = !tasks.data?.length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
      <div className="min-w-0">
        <h1 className="font-heading font-normal italic text-[2rem] mb-5">
          Hey {me.username} — {empty ? 'nothing on your plate.' : 'your work'}
        </h1>
        {empty && (
          <p className="text-sm text-ink-dim mb-6">
            Tasks assigned to you show up here. Head to the <Link className="text-brand font-medium" to={`/s/${space.id}/board`}>board</Link> to pick something up.
          </p>
        )}

        {groups.older.length > 0 && (
          <Section title="Carried over" hint="unfinished, from past sprints">
            <TaskTable tasks={groups.older} selection={selection} showSprint showProject />
          </Section>
        )}
        {current ? (
          (groups.current.length > 0 || groups.backlog.length > 0) && (
            <SprintDndSection
              current={current}
              currentTasks={groups.current}
              backlogTasks={groups.backlog}
              selection={selection}
            />
          )
        ) : (
          groups.backlog.length > 0 && (
            <Section title="In backlog">
              <TaskTable tasks={groups.backlog} selection={selection} showProject />
            </Section>
          )
        )}
      </div>

      <aside className="space-y-6 min-w-0">
        <CurrentSprint sprintName={current?.name} dates={current ? `${fmtDate(current.start_date)} – ${fmtDate(current.end_date)}` : null}
                       count={groups.current.length} spaceId={space.id} />
        <ActiveProjects ids={activeProjectIds} />
        <RecentActivity />
      </aside>

      <MoveBar selection={selection} />
    </div>
  )
}

/** "This sprint" and "In backlog", wired into one drag context so a task can be
 *  dragged straight from the backlog onto the current sprint (and back out). */
function SprintDndSection({ current, currentTasks, backlogTasks, selection }: {
  current: Sprint
  currentTasks: Task[]
  backlogTasks: Task[]
  selection: Selection
}) {
  const update = useUpdateTask()
  const [cols, setCols] = useState<{ current: Task[]; backlog: Task[] }>({ current: currentTasks, backlog: backlogTasks })
  useEffect(() => { setCols({ current: currentTasks, backlog: backlogTasks }) }, [currentTasks, backlogTasks])

  const onDragEnd = ({ source, destination }: DropResult) => {
    if (!destination || source.droppableId === destination.droppableId) return
    const from = source.droppableId as 'current' | 'backlog'
    const to = destination.droppableId as 'current' | 'backlog'
    const task = cols[from][source.index]
    if (!task) return
    const next = { current: [...cols.current], backlog: [...cols.backlog] }
    next[from].splice(source.index, 1)
    next[to].splice(destination.index, 0, task)
    setCols(next)
    update.mutate({ id: task.id, sprint_id: to === 'current' ? current.id : null })
  }

  const list = (key: 'current' | 'backlog') => (
    <Droppable droppableId={key}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`flex flex-col gap-0.5 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-brand-soft/30' : ''}`}
        >
          {cols[key].map((t, i) => (
            <Draggable draggableId={String(t.id)} index={i} key={t.id}>
              {(p) => (
                <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                  <TaskRow task={t} selection={selection} orderedIds={cols[key].map((x) => x.id)} showProject />
                </div>
              )}
            </Draggable>
          ))}
          {!cols[key].length && !snapshot.isDraggingOver && (
            <div className="text-xs text-ink-faint py-3 text-center border border-dashed border-line rounded-lg">
              drag a task here
            </div>
          )}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  )

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Section title="This sprint">{list('current')}</Section>
      <Section title="In backlog">{list('backlog')}</Section>
    </DragDropContext>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{title}</h2>
        {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Panel({ title, to, children }: { title: string; to?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center mb-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-dim">{title}</h2>
        <span className="flex-1" />
        {to && <Link to={to} className="text-[11px] text-brand font-medium hover:underline">view all</Link>}
      </div>
      {children}
    </section>
  )
}

function CurrentSprint({ sprintName, dates, count, spaceId }: {
  sprintName?: string; dates: string | null; count: number; spaceId: number
}) {
  return (
    <Link
      to={`/s/${spaceId}/board`}
      className="group block rounded-2xl p-5 relative overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/10"
      style={{
        background: 'linear-gradient(135deg, color-mix(in oklab, var(--color-brand) 13%, var(--color-card)), var(--color-card) 70%)',
        boxShadow: '0 1px 0 0 color-mix(in oklab, var(--color-brand) 15%, transparent) inset',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-brand" />
        <span className="text-sm font-semibold">{sprintName ?? 'No active sprint'}</span>
      </div>
      {dates && <div className="text-xs font-mono text-ink-faint mt-1">{dates}</div>}
      <div className="text-sm text-ink-dim mt-4">
        <span className="text-4xl font-heading font-normal text-brand tabular-nums">{count}</span>{' '}
        of your tasks this sprint
      </div>
    </Link>
  )
}

function ActiveProjects({ ids }: { ids: Set<number> }) {
  const { space } = useSpace()
  const projects = useProjects(space.id)
  const { byKey } = useStatusDefs('project')
  const active = (projects.data ?? []).filter((p) => !p.archived && ids.has(p.id)).slice(0, 6)
  if (!active.length) return null
  return (
    <Panel title="Active projects" to={`/s/${space.id}/projects`}>
      <div className="flex flex-col gap-0.5 -mx-1">
        {active.map((p) => {
          const done = p.total_tasks - p.open_tasks
          return (
            <Link key={p.id} to={`/projects/${p.id}`}
                  className="group relative flex items-center gap-2 rounded-lg pl-4 pr-2.5 py-2 transition-all duration-150 hover:bg-card hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.12)] dark:hover:shadow-black/30">
              <span
                aria-hidden
                className="absolute left-0.5 inset-y-0 my-1 w-[3px] scale-y-0 rounded-full transition-transform duration-150 origin-center group-hover:scale-y-100"
                style={{ background: `hsl(${(p.id * 137.508) % 360} 70% 60%)` }}
              />
              <span className="flex-1 text-sm font-medium truncate">{p.title}</span>
              {p.total_tasks > 0 && (
                <span className="text-[11px] font-mono text-ink-faint">{done}/{p.total_tasks}</span>
              )}
              <StatusBadge def={byKey[p.status]} dim />
            </Link>
          )
        })}
      </div>
    </Panel>
  )
}

function RecentActivity() {
  const notes = useNotifications(true)
  const items = notes.data?.items.slice(0, 6) ?? []
  if (!items.length) return null
  return (
    <Panel title="Recent">
      <div className="flex flex-col gap-0.5 -mx-2">
        {items.map((n) => (
          <Link key={n.id} to={n.task_id ? `/tasks/${n.task_id}` : n.project_id ? `/projects/${n.project_id}` : '#'}
                className="flex items-start gap-2 text-sm group rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-card">
            <Avatar name={n.actor_username} size={20} />
            <span className="flex-1 min-w-0 leading-snug">
              <span className="font-medium text-ink">{n.actor_username}</span>{' '}
              <span className="text-ink-dim">{NOTE[n.type] ?? n.type}</span>{' '}
              <span className="text-ink group-hover:text-brand transition-colors">{n.task_title ?? n.project_title ?? ''}</span>
              <span className="block text-[11px] text-ink-faint font-mono">{timeAgo(n.created_at)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  )
}
