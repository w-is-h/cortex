import { Archive, ChevronRight, History, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useProject, useProjects, useUpdateProject, useUsers } from '../api/hooks'
import type { Milestone, Priority, ProjectDetail } from '../api/types'
import { Feed } from '../components/Feed'
import { FilterMenu } from '../components/filters'
import { DescriptionEditor } from '../components/MarkdownEditor'
import { useSpace } from '../components/Shell'
import { StatusBadge, useStatusDefs } from '../components/statuses'
import { TagsEditor } from '../components/tags'
import { NewTaskModal, TaskTable, MoveBar, useSelection } from '../components/TaskBits'
import { Avatar, Button, Field, fmtDate, inputCls, Pick, PRIORITIES, PrioDot } from '../components/ui'

export function ProjectPage() {
  const { id } = useParams()
  const project = useProject(Number(id))
  if (project.isPending) return null
  if (project.isError || !project.data)
    return <div className="text-sm text-ink-faint py-10 text-center">Project not found.</div>
  return <ProjectView project={project.data} />
}

function ProjectView({ project }: { project: ProjectDetail }) {
  const { space } = useSpace()
  const update = useUpdateProject()
  const users = useUsers()
  const siblings = useProjects(space.id, true)
  const vocab = [...new Set((siblings.data ?? []).flatMap((p) => p.tags))].sort()
  const owner = users.data?.find((u) => u.id === project.owner_id)
  const { list: projStatuses, byKey } = useStatusDefs('project')
  const selection = useSelection()
  const [newTask, setNewTask] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(project.title)

  useEffect(() => { setTitle(project.title) }, [project.title])


  const saveTitle = () => {
    setEditingTitle(false)
    if (title.trim() && title !== project.title) update.mutate({ id: project.id, title: title.trim() })
    else setTitle(project.title)
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
          <ChevronRight className="size-3.5 text-ink-faint" />
          <span className="text-ink-dim">Project</span>
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
              if (e.key === 'Escape') { setTitle(project.title); setEditingTitle(false) }
            }}
          />
        ) : (
          <div className="flex items-center gap-2.5">
            <h1
              className={`flex-1 text-2xl font-semibold cursor-text leading-snug ${project.archived ? 'text-ink-faint' : ''}`}
              onClick={() => setEditingTitle(true)}
              title="Click to edit"
            >
              {project.title}
            </h1>
            <StatusBadge def={byKey[project.status]} />
            {owner && <Avatar name={owner.username} size={26} />}
          </div>
        )}

        {/* description — rendered markdown; click to edit, blur/Done saves */}
        <section className="mt-3">
          <DescriptionEditor value={project.description}
                             onSave={(md) => update.mutate({ id: project.id, description: md })} />
        </section>

        {/* meta */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t-2 border-line-strong">
          <Field label="Status">
            <Pick
              value={project.status}
              onChange={(v) => update.mutate({ id: project.id, status: v })}
              options={projStatuses.map((s) => ({ value: s.key, label: s.label }))}
            />
          </Field>
          <Field label="Priority">
            <Pick
              value={project.priority}
              onChange={(v) => update.mutate({ id: project.id, priority: v as Priority })}
              options={PRIORITIES.map((p) => ({
                value: p,
                label: <span className="flex items-center gap-1.5"><PrioDot priority={p} /> {p}</span>,
              }))}
            />
          </Field>
          <Field label="Owner">
            <Pick
              value={project.owner_id != null ? String(project.owner_id) : 'none'}
              onChange={(v) => update.mutate({ id: project.id, owner_id: v === 'none' ? null : Number(v) })}
              options={[
                { value: 'none', label: 'Unassigned' },
                ...(users.data?.filter((u) => u.is_active)
                  .map((u) => ({ value: String(u.id), label: u.username })) ?? []),
              ]}
            />
          </Field>
          <Field label="Starts">
            <input type="date" className={inputCls} value={project.start_date ?? ''}
                   onChange={(e) => update.mutate({ id: project.id, start_date: e.target.value || null })} />
          </Field>
          <Field label="Due">
            <input type="date" className={inputCls} value={project.due_date ?? ''}
                   onChange={(e) => update.mutate({ id: project.id, due_date: e.target.value || null })} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Tags">
            <TagsEditor tags={project.tags} vocab={vocab}
                        onChange={(tags) => update.mutate({ id: project.id, tags })} />
          </Field>
        </div>
        <div className="mt-3">
          <MilestonesEditor milestones={project.milestones}
                            onChange={(milestones) => update.mutate({ id: project.id, milestones })} />
        </div>

        {/* tasks */}
        <section className="mt-6 pt-5 border-t border-line">
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-dim">
              Tasks
            </h2>
            <span className="font-mono text-[11px] text-ink-faint">
              {project.total_tasks - project.open_tasks}/{project.total_tasks} done
            </span>
            <span className="flex-1" />
            <FilterMenu users />
            <Button onClick={() => setNewTask(true)}><Plus /> Task</Button>
          </div>
          <TaskTable tasks={project.tasks} selection={selection} showSprint />
        </section>

        <div className="mt-6 pt-4 border-t border-line flex justify-center">
          <button
            className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink transition-colors"
            onClick={() => update.mutate({ id: project.id, archived: !project.archived })}
          >
            <Archive className="size-4" /> {project.archived ? 'Unarchive project' : 'Archive project'}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- right: activity */}
      <aside className="min-w-0 lg:border-l lg:border-line lg:pl-8">
        <div className="flex flex-col max-h-[calc(100vh-3rem)] lg:sticky lg:top-6">
          <Feed parentType="project" parentId={project.id} comments={project.comments} />
        </div>
      </aside>

      <MoveBar selection={selection} />
      <NewTaskModal open={newTask} onClose={() => setNewTask(false)} projectId={project.id} />
    </div>
  )
}

/** Milestones: a date-sorted list of {title, date}; every change replaces the
 *  set. Past milestones are hidden by default behind the history toggle. */
function MilestonesEditor({ milestones, onChange }: {
  milestones: Milestone[]
  onChange: (ms: Milestone[]) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [showPast, setShowPast] = useState(false)
  const todayIso = new Date().toISOString().slice(0, 10)
  const past = milestones.filter((m) => m.date < todayIso)
  const visible = showPast ? milestones : milestones.filter((m) => m.date >= todayIso)
  const add = () => {
    if (!title.trim() || !date) return
    onChange([...milestones, { title: title.trim(), date }])
    setTitle(''); setDate('')
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-medium text-ink-dim">Milestones</span>
        {past.length > 0 && (
          <button
            onClick={() => setShowPast((v) => !v)}
            className={`transition-colors ${showPast ? 'text-brand' : 'text-ink-faint hover:text-ink'}`}
            title={showPast ? 'Hide past milestones' : `Show ${past.length} past milestone${past.length === 1 ? '' : 's'}`}
          >
            <History className="size-3.5" />
          </button>
        )}
      </div>
      {visible.map((m) => (
        <div key={`${m.date}-${m.title}`} className="group flex items-center gap-2.5 text-sm py-0.5">
          <span className={`size-2 rotate-45 rounded-[1px] shrink-0 ml-0.5 ${m.date < todayIso ? 'bg-ink-faint' : 'bg-brand'}`} />
          <span className="font-mono text-xs text-ink-dim whitespace-nowrap">{fmtDate(m.date)}</span>
          <span className={`truncate ${m.date < todayIso ? 'text-ink-faint' : ''}`}>{m.title}</span>
          <button
            onClick={() => onChange(milestones.filter((x) => x !== m))}
            className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-prio-urgent transition-opacity"
            title="Remove milestone"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-0.5 max-w-md">
        <input type="date" className={`${inputCls} w-36`} value={date}
               onChange={(e) => setDate(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <input className={inputCls} placeholder="Add milestone — title, then ↵"
               value={title}
               onChange={(e) => setTitle(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
      </div>
    </div>
  )
}
