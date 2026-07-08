import { ChevronRight, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useBlockerMutation, useDeleteTask, useProjects, useSprints, useTask, useTasks,
  useUpdateTask, useUsers,
} from '../api/hooks'
import type { TaskDetail } from '../api/types'
import { Feed } from '../components/Feed'
import { DescriptionEditor } from '../components/MarkdownEditor'
import { useSpace } from '../components/Shell'
import { BlockedTag, PRIO_OPTS, TaskLink } from '../components/TaskBits'
import { useStatusDefs } from '../components/statuses'
import { Field, Pick } from '../components/ui'

export function TaskPage() {
  const { id } = useParams()
  const task = useTask(Number(id))
  if (task.isPending) return null
  if (task.isError || !task.data) return <div className="text-sm text-ink-faint py-10 text-center">Task not found.</div>
  return <TaskView task={task.data} />
}

function TaskView({ task }: { task: TaskDetail }) {
  const { space } = useSpace()
  const update = useUpdateTask()
  const del = useDeleteTask()
  const navigate = useNavigate()
  const users = useUsers()
  const sprints = useSprints(space.id)
  const projects = useProjects(space.id)

  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(task.title)

  useEffect(() => { setTitle(task.title) }, [task.title])


  const set = (patch: Record<string, unknown>) => update.mutate({ id: task.id, ...patch })
  const { list: taskStatuses } = useStatusDefs('task')
  const { doneKeys: doneProject } = useStatusDefs('project')
  // done projects reject new tasks (409); keep only the current one selectable
  const pickableProjects = (projects.data ?? []).filter(
    (p) => !doneProject.has(p.status) || p.id === task.project_id)

  const saveTitle = () => {
    setEditingTitle(false)
    if (title.trim() && title !== task.title) update.mutate({ id: task.id, title: title.trim() })
    else setTitle(task.title)
  }

  const onDelete = async () => {
    if (confirm('Delete this task?')) {
      await del.mutateAsync(task.id)
      navigate(-1)
    }
  }

  const crumbProject = projects.data?.find((p) => p.id === task.project_id)
  const crumbSprint = sprints.data?.find((s) => s.id === task.sprint_id)
  const openSprint = (sprintId: number) => {
    localStorage.setItem(`cortex.sprint.${space.id}`, String(sprintId))
    navigate(`/s/${space.id}/board`)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_600px] gap-8">
      {/* ---------------------------------------------------- main */}
      <div className="min-w-0">
        {/* breadcrumb */}
        <div className="flex items-center gap-2 text-sm mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2 py-1">
            <span className="grid place-items-center size-4 rounded bg-brand text-brand-ink text-[9px] font-bold uppercase">
              {space.name.slice(0, 1)}
            </span>
            <span className="font-medium">{space.name}</span>
          </span>
          {crumbProject && (
            <>
              <ChevronRight className="size-3.5 text-ink-faint shrink-0" />
              <Link
                to={`/projects/${crumbProject.id}`}
                className="font-medium text-ink-dim hover:text-brand transition-colors truncate max-w-48"
              >
                {crumbProject.title}
              </Link>
            </>
          )}
          {crumbSprint && (
            <>
              <ChevronRight className="size-3.5 text-ink-faint shrink-0" />
              <button
                onClick={() => openSprint(crumbSprint.id)}
                title="Open this sprint on the board"
                className="font-medium text-ink-dim hover:text-brand transition-colors truncate max-w-40"
              >
                {crumbSprint.name}
              </button>
            </>
          )}
          <ChevronRight className="size-3.5 text-ink-faint shrink-0" />
          <button
            className="font-mono text-ink-dim hover:text-brand transition-colors select-all"
            title="Copy task ref"
            onClick={() => task.ref && navigator.clipboard?.writeText(task.ref)}
          >
            {task.ref ?? `#${task.id}`}
          </button>
        </div>

        {/* title */}
        {editingTitle ? (
          <input
            autoFocus
            className="w-full text-2xl font-semibold bg-transparent border-b border-brand focus:outline-none pb-0.5"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle()
              if (e.key === 'Escape') { setTitle(task.title); setEditingTitle(false) }
            }}
          />
        ) : (
          <h1
            className="text-2xl font-semibold cursor-text leading-snug"
            onClick={() => setEditingTitle(true)}
            title="Click to edit"
          >
            {task.title}
          </h1>
        )}
        {task.blocked && <div className="mt-2"><BlockedTag /></div>}

        {/* description — rendered markdown; click to edit, blur/Done saves */}
        <section className="mt-3">
          <DescriptionEditor value={task.description}
                             onSave={(md) => update.mutate({ id: task.id, description: md })} />
        </section>

        {/* meta controls — same shape as the New Task modal */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t-2 border-line-strong">
          <Field label="Status">
            <Pick value={task.status} onChange={(v) => set({ status: v })}
                  options={taskStatuses.map((s) => ({ value: s.key, label: s.label }))} />
          </Field>
          <Field label="Priority">
            <Pick value={task.priority} onChange={(v) => set({ priority: v })} options={PRIO_OPTS} />
          </Field>
          <Field label="Assignee">
            <Pick
              value={task.assignee_id != null ? String(task.assignee_id) : 'none'}
              onChange={(v) => set({ assignee_id: v === 'none' ? null : Number(v) })}
              options={[
                { value: 'none', label: 'Unassigned' },
                ...(users.data?.filter((u) => u.is_active)
                  .map((u) => ({ value: String(u.id), label: u.username })) ?? []),
              ]}
            />
          </Field>
          <Field label="Sprint">
            <Pick
              value={task.sprint_id != null ? String(task.sprint_id) : 'none'}
              onChange={(v) => set({ sprint_id: v === 'none' ? null : Number(v) })}
              options={[
                { value: 'none', label: 'Backlog' },
                ...(sprints.data?.map((s) => ({
                  value: String(s.id),
                  label: `${s.name}${s.is_current ? ' · current' : ''}`,
                })) ?? []),
              ]}
            />
          </Field>
          <Field label="Project">
            <Pick
              value={task.project_id != null ? String(task.project_id) : 'none'}
              onChange={(v) => set({ project_id: v === 'none' ? null : Number(v) })}
              options={[
                { value: 'none', label: '—' },
                ...pickableProjects.map((p) => ({ value: String(p.id), label: p.title })),
              ]}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Blockers task={task} />
        </div>

        <div className="mt-6 pt-4 border-t border-line flex justify-center">
          <button
            className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-danger transition-colors"
            onClick={onDelete}
          >
            <Trash2 className="size-4" /> Delete task
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- right: activity */}
      <aside className="min-w-0 lg:border-l lg:border-line lg:pl-8">
        <div className="flex flex-col max-h-[calc(100vh-3rem)] lg:sticky lg:top-6">
          <Feed parentType="task" parentId={task.id} comments={task.comments} activity={task.activity} />
        </div>
      </aside>
    </div>
  )
}

function Blockers({ task }: { task: TaskDetail }) {
  const { space } = useSpace()
  const blocker = useBlockerMutation()
  const [adding, setAdding] = useState(false)
  const candidates = useTasks({ space_id: space.id }, { enabled: adding })

  return (
    <div className="space-y-2">
      <Field label="Blocked by">
        <div className="space-y-1">
          {task.blockers.map((b) => (
            <div key={b.id} className="flex items-center gap-1 group">
              <TaskLink task={b} />
              <button
                className="text-ink-faint hover:text-danger opacity-0 group-hover:opacity-100 text-sm"
                onClick={() => blocker.mutate({ taskId: task.id, blockerId: b.id, remove: true })}
                title="Remove blocker"
              >
                ×
              </button>
            </div>
          ))}
          {adding ? (
            <Pick
              value={null}
              placeholder="Pick a task…"
              onChange={(v) => {
                blocker.mutate({ taskId: task.id, blockerId: Number(v) })
                setAdding(false)
              }}
              options={(candidates.data ?? [])
                .filter((t) => t.id !== task.id && !task.blockers.some((b) => b.id === t.id))
                .map((t) => ({ value: String(t.id), label: `#${t.id} ${t.title}` }))}
            />
          ) : (
            <button className="text-xs text-ink-faint hover:text-ink transition-colors" onClick={() => setAdding(true)}>
              + add blocker
            </button>
          )}
        </div>
      </Field>
      {task.blocking.length > 0 && (
        <Field label="Blocks">
          <div className="space-y-1">
            {task.blocking.map((b) => <div key={b.id}><TaskLink task={b} /></div>)}
          </div>
        </Field>
      )}
    </div>
  )
}
