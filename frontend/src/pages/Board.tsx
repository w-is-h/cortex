import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Checkbox } from '@/components/ui/checkbox'
import { useCreateSprint, useSprints, useTasks, useUpdateTask } from '../api/hooks'
import type { Sprint, StatusDef, Task } from '../api/types'
import { useSpace } from '../components/Shell'
import { useStatusDefs } from '../components/statuses'
import {
  AssigneeMenu, BlockedTag, MoveBar, NewTaskModal, ProjectChip, TaskTable, useSelection,
  type Selection,
} from '../components/TaskBits'
import {
  Button, Empty, Field, fmtDate, inputCls, Modal, Pick, PRIO_COLOR, SegmentedToggle,
} from '../components/ui'

const sprintKey = (spaceId: number) => `cortex.sprint.${spaceId}`

export function Board() {
  const { space } = useSpace()
  const sprints = useSprints(space.id)
  const [sprintId, setSprintId] = useState<number | null>(() =>
    Number(localStorage.getItem(sprintKey(space.id))) || null,
  )
  const [view, setView] = useState<'kanban' | 'list'>(
    () => (localStorage.getItem('cortex.view') as 'kanban' | 'list') || 'kanban',
  )
  type ListGroup = 'none' | 'status' | 'project' | 'user' | 'tag'
  const [listGroup, setListGroup] = useState<ListGroup>(
    () => (localStorage.getItem('cortex.board.group') as ListGroup) || 'status',
  )
  const [newTask, setNewTask] = useState<string | null>(null)
  const [newSprint, setNewSprint] = useState(false)
  const selection = useSelection()
  const { list: statuses } = useStatusDefs('task')

  const stored = Number(localStorage.getItem(sprintKey(space.id))) || null
  const wanted = sprintId ?? stored
  const sprint =
    sprints.data?.find((s) => s.id === wanted) ??
    sprints.data?.find((s) => s.is_current) ??
    sprints.data?.find((s) => !s.archived) ??
    sprints.data?.[0]

  const pickSprint = (id: number) => {
    localStorage.setItem(sprintKey(space.id), String(id))
    setSprintId(id)
    selection.clear()
  }

  const tasks = useTasks({ space_id: space.id, sprint_id: sprint?.id }, { enabled: !!sprint })

  if (sprints.isPending) return null
  if (!sprint)
    return (
      <div>
        <Empty>No sprints in {space.name} yet.</Empty>
        <div className="text-center">
          <Button kind="primary" onClick={() => setNewSprint(true)}>Create the first sprint</Button>
        </div>
        <NewSprintModal open={newSprint} onClose={() => setNewSprint(false)} />
      </div>
    )

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Pick
          className="w-fit font-semibold"
          value={String(sprint.id)}
          onChange={(v) => {
            if (v === '__new') setNewSprint(true)
            else pickSprint(Number(v))
          }}
          options={[
            ...sprints.data!.filter((s) => !s.archived || s.id === sprint.id).map((s) => ({
              value: String(s.id),
              label: (
                <span>
                  {s.name}
                  {s.is_current && <span className="text-brand text-xs ml-1.5">current</span>}
                </span>
              ),
            })),
            { value: '__new', label: '+ new sprint…' },
          ]}
        />
        <span className="text-xs text-ink-faint font-mono">
          {fmtDate(sprint.start_date)} – {fmtDate(sprint.end_date)}
        </span>

        <div className="flex-1" />

        {view === 'list' && (
          <SegmentedToggle
            value={listGroup}
            onChange={(v) => { setListGroup(v); localStorage.setItem('cortex.board.group', v) }}
            options={[
              { value: 'none', label: 'None' },
              { value: 'status', label: 'Status' },
              { value: 'project', label: 'Project' },
              { value: 'user', label: 'User' },
              { value: 'tag', label: 'Tag' },
            ]}
          />
        )}
        <SegmentedToggle
          value={view}
          onChange={(v) => { setView(v); localStorage.setItem('cortex.view', v) }}
          options={[{ value: 'kanban', label: 'Board' }, { value: 'list', label: 'List' }]}
        />
        <Button kind="primary" onClick={() => setNewTask(statuses[0]?.key ?? 'todo')}>
          <Plus /> Task
        </Button>
      </div>

      {view === 'kanban' ? (
        <Kanban tasks={tasks.data ?? []} statuses={statuses} selection={selection} onAdd={setNewTask} />
      ) : (
        <div className="max-w-5xl mx-auto">
          <TaskTable tasks={tasks.data ?? []} selection={selection} showProject={listGroup !== 'project'}
                     groupBy={listGroup === 'none' ? undefined : listGroup} />
        </div>
      )}

      <MoveBar selection={selection} />
      <NewTaskModal
        open={newTask !== null}
        onClose={() => setNewTask(null)}
        sprintId={sprint.id}
        status={newTask ?? statuses[0]?.key ?? 'todo'}
      />
      <NewSprintModal open={newSprint} onClose={() => setNewSprint(false)} previous={sprints.data} />
    </div>
  )
}

// ---------------------------------------------------------------- kanban

function midpoint(before: Task | undefined, after: Task | undefined): number {
  if (before && after) return (before.sort_order + after.sort_order) / 2
  if (before) return before.sort_order + 1024
  if (after) return after.sort_order - 1024
  return 1024
}

function group(tasks: Task[], statuses: StatusDef[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {}
  for (const s of statuses) map[s.key] = []
  for (const t of tasks) (map[t.status] ??= []).push(t)
  for (const k in map) map[k].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  return map
}

function Kanban({ tasks, statuses, selection, onAdd }: {
  tasks: Task[]
  statuses: StatusDef[]
  selection: Selection
  onAdd: (status: string) => void
}) {
  const update = useUpdateTask()

  // hello-pangea/dnd needs the reordered list synchronously on drop. React Query's
  // observer notifications are batched (deferred a tick), so driving the board off the
  // query cache alone leaves the card in its origin column for one frame — the flash.
  // We keep the column order in local state, update it directly in onDragEnd (a plain
  // event-handler setState, flushed before paint), and reconcile from the query after.
  const [columns, setColumns] = useState<Record<string, Task[]>>(() => group(tasks, statuses))
  useEffect(() => { setColumns(group(tasks, statuses)) }, [tasks, statuses])

  // flattened visual order (column by column) for shift-click range selection
  const orderedIds = statuses.flatMap((s) => columns[s.key] ?? []).map((t) => t.id)

  const onDragEnd = ({ source, destination }: DropResult) => {
    if (!destination) return
    const from = source.droppableId
    const to = destination.droppableId
    if (from === to && source.index === destination.index) return

    const task = columns[from]?.[source.index]
    if (!task) return

    const next: Record<string, Task[]> = {}
    for (const k in columns) next[k] = [...columns[k]]
    next[from].splice(source.index, 1)
    const moved = { ...task, status: to }
    ;(next[to] ??= []).splice(destination.index, 0, moved)
    moved.sort_order = midpoint(next[to][destination.index - 1], next[to][destination.index + 1])
    setColumns(next)

    update.mutate({ id: task.id, status: to, sort_order: moved.sort_order })
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 items-start overflow-x-auto pb-1">
        {statuses.map((status) => (
          <Droppable droppableId={status.key} key={status.key}>
            {(provided, snapshot) => (
              <div
                className="rounded-2xl transition-colors flex flex-col h-[calc(100vh-8rem)] flex-1 min-w-[264px]"
                style={snapshot.isDraggingOver
                  ? { background: 'color-mix(in oklab, var(--color-brand) 8%, var(--background))' }
                  : undefined}
              >
                <div className="flex items-center gap-2 px-1 pt-1 pb-2.5 shrink-0">
                  <span className="w-1 h-3.5 rounded-full" style={{ background: status.color }} />
                  <span className="text-base font-semibold">{status.label}</span>
                  <span className="font-mono text-xs text-ink-faint bg-raised rounded-full px-1.5">
                    {(columns[status.key] ?? []).length}
                  </span>
                  <span className="flex-1" />
                  <button
                    onClick={() => onAdd(status.key)}
                    title={`Add task in ${status.label}`}
                    className="grid place-items-center size-7 rounded-lg text-ink-faint hover:text-brand hover:bg-brand-soft transition-colors"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex-1 min-h-0 overflow-y-auto px-1 space-y-2"
                >
                  {(columns[status.key] ?? []).map((task, index) => (
                    <Draggable draggableId={String(task.id)} index={index} key={task.id}>
                      {(p, snap) => (
                        <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                          <Card task={task} selection={selection} dragging={snap.isDragging}
                                orderedIds={orderedIds} done={status.is_done} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  )
}

/** Markdown → one-line plain text for card previews. */
function mdPreview(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s*)?/gm, '')
    .replace(/[#>`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function Card({ task, selection, dragging, orderedIds, done }: {
  task: Task
  selection: Selection
  dragging?: boolean
  orderedIds: number[]
  done?: boolean
}) {
  const navigate = useNavigate()
  const selected = selection.isSelected(task.id)
  const selecting = selection.selected.size > 0
  const preview = mdPreview(task.description)

  return (
    <div
      onClick={(e) => {
        if (e.shiftKey) selection.selectRange(task.id, orderedIds)
        else if (e.metaKey || e.ctrlKey || selecting) selection.toggle(task.id)
        else navigate(`/tasks/${task.id}`)
      }}
      className={`group relative bg-card border rounded-2xl px-3 py-2.5 cursor-pointer select-none
        transition-all duration-150
        ${selected ? 'border-brand ring-2 ring-brand-soft' : 'border-line/70 hover:border-line-strong'}
        ${dragging
          ? 'shadow-lg shadow-black/10 dark:shadow-black/40 border-line-strong scale-[1.02]'
          : 'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/8 dark:hover:shadow-black/30'}`}
      style={{ borderLeftWidth: 3, borderLeftColor: PRIO_COLOR[task.priority] }}
      title={selecting ? 'Click to toggle selection' : '⌘-click to select'}
    >
      <span
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-2.5 right-2.5 transition-opacity ${
          selected || selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <Checkbox checked={selected} onCheckedChange={() => selection.toggle(task.id)} />
      </span>

      {task.blocked && <div className="mb-1.5"><BlockedTag /></div>}

      <div className={`text-[0.98rem] font-medium leading-snug pr-5 ${done ? 'text-ink-faint' : ''}`}>
        {task.title}
      </div>
      {preview && (
        <p className="text-xs text-ink-dim leading-snug mt-1 line-clamp-2">{preview}</p>
      )}

      <div className="flex items-center gap-1.5 mt-2.5">
        <ProjectChip projectId={task.project_id} />
        <span className="flex-1" />
        <AssigneeMenu task={task} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- new sprint

function nextMonday(): Date {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return d
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function NewSprintModal({ open, onClose, previous }: { open: boolean; onClose: () => void; previous?: Sprint[] }) {
  const { space } = useSpace()
  const create = useCreateSprint()
  const n = (previous?.length ?? 0) + 1
  const [name, setName] = useState('')
  const [start, setStart] = useState(iso(nextMonday()))
  const [days, setDays] = useState(space.default_sprint_days)

  const end = useMemo(() => {
    const d = new Date(start + 'T00:00:00')
    d.setDate(d.getDate() + days - 1)
    return iso(d)
  }, [start, days])

  return (
    <Modal open={open} onClose={onClose} title="New sprint">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          await create.mutateAsync({
            space_id: space.id,
            name: name.trim() || `Sprint ${n}`,
            start_date: start,
            end_date: end,
          })
          onClose()
        }}
        className="space-y-3"
      >
        <input autoFocus className={inputCls} placeholder={`Sprint ${n}`} value={name}
               onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <Field label="Starts">
            <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Length">
            <Pick
              value={String(days)}
              onChange={(v) => setDays(Number(v))}
              options={[
                { value: '7', label: '1 week' }, { value: '14', label: '2 weeks' },
                { value: '21', label: '3 weeks' }, { value: '28', label: '4 weeks' },
              ]}
            />
          </Field>
          <Field label="Ends">
            <input type="date" className={inputCls} value={end} readOnly disabled />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button kind="primary" type="submit" disabled={create.isPending}>Create sprint</Button>
        </div>
      </form>
    </Modal>
  )
}
