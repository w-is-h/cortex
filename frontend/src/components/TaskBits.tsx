import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Check, CircleSlash, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { useCreateTask, useMoveTasks, useProjects, useSprints, useUpdateTask, useUsers } from '../api/hooks'
import type { Priority, Task } from '../api/types'
import { bucketBy } from '@/lib/utils'
import { useSpace } from './Shell'
import { useStatusDefs } from './statuses'
import { chipStyle, TagChip } from './tags'
import {
  Avatar, Button, Field, inputCls, Modal, Pick, PRIO_COLOR, PRIORITIES, PrioDot,
  projectHue, RowAccent, rowCls, rowHoverCls,
} from './ui'

// ---- selection

export function useSelection() {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // last individually-picked task; the fixed end for shift-click range selection
  const anchor = useRef<number | null>(null)
  return {
    selected,
    isSelected: (id: number) => selected.has(id),
    toggle: (id: number) => {
      anchor.current = id
      setSelected((s) => {
        const next = new Set(s)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    /** Shift-click: add everything between the anchor and `id` in the given visual order. */
    selectRange: (id: number, orderedIds: number[]) => {
      const from = anchor.current
      const i = from == null ? -1 : orderedIds.indexOf(from)
      const j = orderedIds.indexOf(id)
      if (i === -1 || j === -1) {
        anchor.current = id
        setSelected((s) => new Set(s).add(id))
        return
      }
      const [lo, hi] = i <= j ? [i, j] : [j, i]
      setSelected((s) => {
        const next = new Set(s)
        for (let k = lo; k <= hi; k++) next.add(orderedIds[k])
        return next
      })
    },
    clear: () => { anchor.current = null; setSelected(new Set()) },
    setMany: (ids: number[]) => {
      anchor.current = ids.at(-1) ?? null
      setSelected(new Set(ids))
    },
  }
}

export type Selection = ReturnType<typeof useSelection>

// ---- small pieces

export function BlockedTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-prio-urgent bg-prio-urgent/10 border border-prio-urgent/20 rounded-full px-1.5 py-px">
      <CircleSlash className="size-2.5" />
      blocked
    </span>
  )
}

export function ProjectChip({ projectId }: { projectId: number | null }) {
  const { space } = useSpace()
  const projects = useProjects(space.id, true)
  const project = projects.data?.find((p) => p.id === projectId)
  if (!project) return null
  return (
    <Link
      to={`/projects/${project.id}`}
      onClick={(e) => e.stopPropagation()}
      className="text-[12px] font-medium rounded-md px-1.5 py-px truncate max-w-36 hover:brightness-125 transition-[filter]"
      style={chipStyle(projectHue(project.id))}
      title={project.title}
    >
      {project.title}
    </Link>
  )
}

/** Clickable assignee avatar → dropdown to (re)assign the task. */
export function AssigneeMenu({ task, size = 22 }: { task: Task; size?: number }) {
  const users = useUsers()
  const update = useUpdateTask()
  const current = users.data?.find((u) => u.id === task.assignee_id)
  const set = (assignee_id: number | null) => update.mutate({ id: task.id, assignee_id })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className="rounded-full outline-none hover:brightness-110 transition-[filter]"
        title={current ? `Assigned to ${current.username} — click to change` : 'Assign'}
      >
        {current ? (
          <Avatar name={current.username} size={size} />
        ) : (
          <span className="rounded-full border border-dashed border-line-strong grid place-items-center shrink-0"
                style={{ width: size, height: size }}>
            <UserRound className="size-3 text-ink-faint" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="w-44">
        <DropdownMenuItem onClick={() => set(null)}>
          <span className="size-4 rounded-full border border-dashed border-line-strong grid place-items-center">
            <UserRound className="size-2.5 text-ink-faint" />
          </span>
          Unassigned
          {task.assignee_id == null && <Check className="ml-auto size-3.5 text-brand" />}
        </DropdownMenuItem>
        {users.data?.filter((u) => u.is_active).map((u) => (
          <DropdownMenuItem key={u.id} onClick={() => set(u.id)}>
            <Avatar name={u.username} size={16} />
            <span className="truncate">{u.username}</span>
            {u.id === task.assignee_id && <Check className="ml-auto size-3.5 text-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---- inline pickers used in the list view

export function StatusSelect({ task }: { task: Task }) {
  const update = useUpdateTask()
  const { list } = useStatusDefs('task')
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Pick
        size="sm"
        className="hover:bg-accent text-ink-dim w-fit"
        value={task.status}
        onChange={(v) => update.mutate({ id: task.id, status: v })}
        options={list.map((s) => ({ value: s.key, label: s.label }))}
      />
    </span>
  )
}

const PRIO_OPTS = PRIORITIES.map((p) => ({
  value: p,
  label: (
    <span className="flex items-center gap-1.5">
      <PrioDot priority={p} /> {p}
    </span>
  ),
}))

// ---- single row, shared by TaskTable and any other draggable task list (e.g. Home's
// backlog <-> current-sprint DnD, which needs rows outside a single TaskTable instance)

export function TaskRow({ task, selection, orderedIds, showProject = false, sprintLabel }: {
  task: Task
  selection?: Selection
  orderedIds: number[]
  showProject?: boolean
  sprintLabel?: string | null
}) {
  const navigate = useNavigate()
  const { doneKeys } = useStatusDefs('task')
  const selecting = !!selection && selection.selected.size > 0
  return (
    <div
      onClick={(e) => {
        if (selection && e.shiftKey) selection.selectRange(task.id, orderedIds)
        else if (selection && (e.metaKey || e.ctrlKey || selecting)) selection.toggle(task.id)
        else navigate(`/tasks/${task.id}`)
      }}
      className={`${rowCls} ${
        selection?.isSelected(task.id) ? 'bg-brand-soft/60' : rowHoverCls
      } gap-3 pl-4 pr-3 py-2 cursor-pointer select-none`}
    >
      <RowAccent color={PRIO_COLOR[task.priority]} />
      {selection && (
        <span onClick={(e) => e.stopPropagation()} className="grid place-items-center">
          <Checkbox checked={selection.isSelected(task.id)} onCheckedChange={() => selection.toggle(task.id)} />
        </span>
      )}
      <PrioDot priority={task.priority} />
      <span className={`flex-1 text-[1.02rem] font-medium truncate ${doneKeys.has(task.status) ? 'text-ink-faint' : ''}`}>
        {task.title}
      </span>
      {task.blocked && <BlockedTag />}
      {showProject && <ProjectChip projectId={task.project_id} />}
      {sprintLabel != null && (
        <span className="text-xs text-ink-faint font-mono whitespace-nowrap">{sprintLabel}</span>
      )}
      <StatusSelect task={task} />
      <AssigneeMenu task={task} size={20} />
    </div>
  )
}

// ---- table (list view, backlog, project tasks)

export function TaskTable({
  tasks, selection, showSprint = false, showProject = false, groupBy,
}: {
  tasks: Task[]
  selection?: Selection
  showSprint?: boolean
  showProject?: boolean
  groupBy?: 'status' | 'project' | 'user' | 'tag'
}) {
  const { space } = useSpace()
  const sprints = useSprints(showSprint ? space.id : undefined)
  const { list: statuses } = useStatusDefs('task')
  const projects = useProjects(space.id, true)
  const users = useUsers()
  const update = useUpdateTask()

  // group definitions: order, header, and the patch to apply when a task is dropped in
  // patch: applied when a task is dropped into the group; null = not a drop target
  type Group = { key: string; header: ReactNode; patch: Partial<Task> | null; tasks: Task[] }
  const defs = useMemo<Group[]>(() => {
    if (groupBy === 'status') {
      return bucketBy(tasks, (t) => t.status, statuses.map((s) => s.key)).map(([key, items]) => {
        const s = statuses.find((x) => x.key === key)!
        return {
          key: s.key, tasks: items, patch: { status: s.key },
          header: (<><span className="w-1 h-3.5 rounded-full" style={{ background: s.color }} /><span className="text-sm font-semibold">{s.label}</span></>),
        }
      })
    }
    if (groupBy === 'project') {
      return bucketBy(tasks, (t) => t.project_id, (projects.data ?? []).map((p) => p.id)).map(([id, items]) => {
        const p = projects.data?.find((x) => x.id === id)
        return p
          ? {
              key: `p${p.id}`, tasks: items, patch: { project_id: p.id },
              header: (<><span className="w-2 h-2 rounded-full" style={{ background: `hsl(${projectHue(p.id)} 70% 60%)` }} /><span className="text-sm font-semibold truncate">{p.title}</span></>),
            }
          : { key: 'none', tasks: items, patch: { project_id: null }, header: <span className="text-sm font-semibold text-ink-dim">No project</span> }
      })
    }
    if (groupBy === 'tag') {
      // a task's tag is its project's first tag; dropping here has no sane patch
      const firstTag = (t: Task) => projects.data?.find((p) => p.id === t.project_id)?.tags[0] ?? null
      return bucketBy(tasks, firstTag).map(([tag, items]) => tag
        ? { key: `t${tag}`, tasks: items, patch: null, header: <TagChip tag={tag} /> }
        : { key: 'none', tasks: items, patch: null, header: <span className="text-sm font-semibold text-ink-dim">No tag</span> })
    }
    if (groupBy === 'user') {
      return bucketBy(tasks, (t) => t.assignee_id, (users.data ?? []).map((u) => u.id)).map(([id, items]) => {
        const u = users.data?.find((x) => x.id === id)
        return u
          ? {
              key: `u${u.id}`, tasks: items, patch: { assignee_id: u.id },
              header: (<><Avatar name={u.username} size={18} /><span className="text-sm font-semibold">{u.username}</span></>),
            }
          : { key: 'none', tasks: items, patch: { assignee_id: null }, header: <span className="text-sm font-semibold text-ink-dim">Unassigned</span> }
      })
    }
    return []
  }, [tasks, groupBy, statuses, projects.data, users.data])

  // local column state so drag-to-another-group feels instant (see board DnD note)
  const [cols, setCols] = useState<Record<string, Task[]>>({})
  useEffect(() => {
    setCols(Object.fromEntries(defs.map((d) => [d.key, d.tasks])))
  }, [defs])

  const orderedIds = (groupBy ? defs.flatMap((d) => cols[d.key] ?? d.tasks) : tasks).map((t) => t.id)

  const onDragEnd = ({ source, destination }: DropResult) => {
    if (!destination || source.droppableId === destination.droppableId) return
    const from = source.droppableId
    const to = destination.droppableId
    const task = cols[from]?.[source.index]
    const def = defs.find((d) => d.key === to)
    if (!task || !def || !def.patch) return
    const next: Record<string, Task[]> = {}
    for (const k in cols) next[k] = [...cols[k]]
    next[from].splice(source.index, 1)
    ;(next[to] ??= []).splice(destination.index, 0, { ...task, ...def.patch })
    setCols(next)
    update.mutate({ id: task.id, ...def.patch })
  }

  const sprintLabel = (task: Task): string | undefined =>
    showSprint
      ? (task.sprint_id ? sprints.data?.find((s) => s.id === task.sprint_id)?.name ?? `sprint ${task.sprint_id}` : 'backlog')
      : undefined

  const rowContent = (task: Task) => (
    <TaskRow
      task={task}
      selection={selection}
      orderedIds={orderedIds}
      showProject={showProject}
      sprintLabel={sprintLabel(task)}
    />
  )

  if (!tasks.length) return <div className="text-sm text-ink-faint py-8 text-center">No tasks.</div>

  if (!groupBy) {
    return (
      <div className="flex flex-col gap-0.5">
        {tasks.map((t) => <div key={t.id}>{rowContent(t)}</div>)}
      </div>
    )
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="space-y-6">
        {defs.map((d) => (
          <div key={d.key}>
            <div className="flex items-center gap-2 px-1 mb-1.5">
              {d.header}
              <span className="font-mono text-xs text-ink-faint bg-raised rounded-full px-1.5">
                {(cols[d.key] ?? d.tasks).length}
              </span>
            </div>
            <Droppable droppableId={d.key} isDropDisabled={!d.patch}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex flex-col gap-0.5 rounded-lg transition-colors ${
                    snapshot.isDraggingOver ? 'bg-brand-soft/30' : ''
                  }`}
                >
                  {(cols[d.key] ?? d.tasks).map((t, i) => (
                    <Draggable draggableId={String(t.id)} index={i} key={t.id}>
                      {(p) => (
                        <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                          {rowContent(t)}
                        </div>
                      )}
                    </Draggable>
                  ))}
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

// ---- floating move bar

export function MoveBar({ selection }: { selection: Selection }) {
  const { space } = useSpace()
  const sprints = useSprints(space.id)
  const users = useUsers()
  const move = useMoveTasks()
  const update = useUpdateTask()
  const count = selection.selected.size
  if (count === 0) return null

  const ids = [...selection.selected]

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-popover border border-line-strong rounded-xl shadow-xl shadow-black/40 flex items-center gap-1.5 pl-4 pr-2 py-2"
      style={{ animation: 'rise 140ms ease-out' }}
    >
      <span className="text-sm font-medium whitespace-nowrap">
        <span className="text-brand font-mono">{count}</span> selected
      </span>
      <span className="w-px h-5 bg-line-strong mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger className="text-sm font-medium border border-input rounded-lg px-2.5 py-1 hover:bg-raised transition-colors outline-none">
          Move to…
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          <DropdownMenuItem
            onClick={async () => {
              await move.mutateAsync({ task_ids: ids, sprint_id: null })
              selection.clear()
            }}
          >
            Backlog
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Sprints</DropdownMenuLabel>
            {sprints.data?.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={async () => {
                  await move.mutateAsync({ task_ids: ids, sprint_id: s.id })
                  selection.clear()
                }}
              >
                {s.name}
                {s.is_current && <span className="text-xs text-brand ml-1">current</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger className="text-sm font-medium border border-input rounded-lg px-2.5 py-1 hover:bg-raised transition-colors outline-none">
          Assign to…
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top">
          {users.data?.filter((u) => u.is_active).map((u) => (
            <DropdownMenuItem
              key={u.id}
              onClick={async () => {
                await Promise.all(ids.map((id) => update.mutateAsync({ id, assignee_id: u.id })))
                selection.clear()
              }}
            >
              <Avatar name={u.username} size={16} />
              {u.username}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button kind="ghost" size="sm" onClick={selection.clear}>Cancel</Button>
      <style>{`@keyframes rise { from { opacity: 0; transform: translate(-50%, 8px) } to { transform: translate(-50%, 0) } }`}</style>
    </div>
  )
}

// ---- new task modal

export function NewTaskModal({
  open, onClose, sprintId, projectId, status,
}: {
  open: boolean
  onClose: () => void
  sprintId?: number | null
  projectId?: number
  status?: string
}) {
  const { space } = useSpace()
  const create = useCreateTask()
  const users = useUsers()
  const sprints = useSprints(space.id)
  const projects = useProjects(space.id)
  const { list: taskStatuses } = useStatusDefs('task')
  const { doneKeys: doneProject } = useStatusDefs('project')
  // the backend rejects new tasks in a done project, so don't offer them
  const openProjects = (projects.data ?? []).filter((p) => !doneProject.has(p.status))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [assignee, setAssignee] = useState('')
  const [sprint, setSprint] = useState<string>(sprintId != null ? String(sprintId) : '')
  const [project, setProject] = useState<string>(projectId != null ? String(projectId) : '')

  // keep defaults in sync when opened from a specific sprint/project
  const defaults = useMemo(
    () => ({ s: sprintId != null ? String(sprintId) : '', p: projectId != null ? String(projectId) : '' }),
    [sprintId, projectId],
  )
  const [lastDefaults, setLastDefaults] = useState(defaults)
  if (defaults.s !== lastDefaults.s || defaults.p !== lastDefaults.p) {
    setLastDefaults(defaults)
    setSprint(defaults.s)
    setProject(defaults.p)
  }

  const submit = async () => {
    if (!title.trim()) return
    await create.mutateAsync({
      space_id: space.id,
      title: title.trim(),
      description,
      status: status ?? taskStatuses[0]?.key ?? 'todo',
      priority,
      assignee_id: assignee ? Number(assignee) : null,
      sprint_id: sprint ? Number(sprint) : null,
      project_id: project ? Number(project) : null,
    })
    setTitle('')
    setDescription('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New task" wide>
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="space-y-3">
        <input autoFocus className={inputCls} placeholder="Task title" value={title}
               onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          className="min-h-24 font-mono text-[0.85rem]"
          placeholder="Description (markdown, @mention to notify)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="Priority">
            <Pick value={priority} onChange={(v) => setPriority(v as Priority)} options={PRIO_OPTS} />
          </Field>
          <Field label="Assignee">
            <Pick
              value={assignee || null}
              placeholder="—"
              onChange={setAssignee}
              options={users.data?.filter((u) => u.is_active)
                .map((u) => ({ value: String(u.id), label: u.username })) ?? []}
            />
          </Field>
          <Field label="Sprint">
            <Pick
              value={sprint || ''}
              onChange={setSprint}
              options={[
                { value: '', label: 'Backlog' },
                ...(sprints.data?.map((s) => ({ value: String(s.id), label: s.name })) ?? []),
              ]}
            />
          </Field>
          <Field label="Project">
            <Pick
              value={project || null}
              placeholder="—"
              onChange={setProject}
              options={openProjects.map((p) => ({ value: String(p.id), label: p.title }))}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="primary" type="submit" disabled={!title.trim() || create.isPending}>
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function TaskLink({ task }: { task: Task }) {
  const { doneKeys } = useStatusDefs('task')
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="inline-flex items-center gap-1.5 text-sm hover:text-brand transition-colors"
    >
      <PrioDot priority={task.priority} />
      <span className={doneKeys.has(task.status) ? 'text-ink-faint' : ''}>{task.title}</span>
    </Link>
  )
}

export { PRIO_OPTS }
