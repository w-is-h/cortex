import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMyTasks, useNotifications, useProjects, useSprints, useTasks } from '../api/hooks'
import { useSpace } from '../components/Shell'
import { StatusBadge, useStatusDefs } from '../components/statuses'
import { Avatar, fmtDate, timeAgo } from '../components/ui'
import { MoveBar, TaskTable, useSelection } from '../components/TaskBits'

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
        <h1 className="text-xl font-bold mb-5">
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
        {groups.current.length > 0 && (
          <Section title="This sprint">
            <TaskTable tasks={groups.current} selection={selection} showSprint showProject />
          </Section>
        )}
        {groups.backlog.length > 0 && (
          <Section title="In backlog">
            <TaskTable tasks={groups.backlog} selection={selection} showProject />
          </Section>
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
    <Link to={`/s/${spaceId}/board`}
          className="block rounded-2xl border border-line bg-card p-4 hover:border-line-strong transition-colors shadow-sm shadow-black/5 dark:shadow-none">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-brand" />
        <span className="text-sm font-semibold">{sprintName ?? 'No active sprint'}</span>
      </div>
      {dates && <div className="text-xs font-mono text-ink-faint mt-1">{dates}</div>}
      <div className="text-sm text-ink-dim mt-3">
        <span className="text-2xl font-bold text-ink">{count}</span> of your tasks this sprint
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
      <div className="space-y-1.5">
        {active.map((p) => {
          const done = p.total_tasks - p.open_tasks
          return (
            <Link key={p.id} to={`/projects/${p.id}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2 hover:border-line-strong transition-colors">
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
      <div className="space-y-2">
        {items.map((n) => (
          <Link key={n.id} to={n.task_id ? `/tasks/${n.task_id}` : n.project_id ? `/projects/${n.project_id}` : '#'}
                className="flex items-start gap-2 text-sm group">
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
