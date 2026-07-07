import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeleteSprint, useSprints, useUpdateSprint } from '../api/hooks'
import type { Sprint } from '../api/types'
import { useSpace } from '../components/Shell'
import { Button, Empty, Field, fmtDate, inputCls, Modal } from '../components/ui'
import { NewSprintModal } from './Board'

export function Sprints() {
  const { space } = useSpace()
  const sprints = useSprints(space.id)
  const [creating, setCreating] = useState(false)

  const items = sprints.data ?? []
  const active = items.filter((s) => !s.archived)
  const archived = items.filter((s) => s.archived)

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-xl font-bold">Sprints</h1>
        <span className="font-mono text-[11px] text-ink-faint mt-0.5">{items.length}</span>
        <div className="flex-1" />
        <Button kind="primary" onClick={() => setCreating(true)}><Plus /> Sprint</Button>
      </div>

      <div className="max-w-5xl mx-auto">
        {!items.length && <Empty>No sprints in {space.name} yet.</Empty>}
        {active.length > 0 && <SprintList sprints={active} />}
        {archived.length > 0 && (
          <>
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-ink-dim mt-6 mb-2">
              Archived · auto after due date + 7 days
            </h2>
            <SprintList sprints={archived} />
          </>
        )}
      </div>

      <NewSprintModal open={creating} onClose={() => setCreating(false)} previous={items} />
    </div>
  )
}

function SprintList({ sprints }: { sprints: Sprint[] }) {
  const { space } = useSpace()
  const navigate = useNavigate()
  const update = useUpdateSprint()
  const del = useDeleteSprint()
  const [editing, setEditing] = useState<Sprint | null>(null)

  const open = (s: Sprint) => {
    localStorage.setItem(`cortex.sprint.${space.id}`, String(s.id))
    navigate(`/s/${space.id}/board`)
  }

  return (
    <>
      <div className="border border-line rounded-xl overflow-hidden bg-panel divide-y divide-line">
        {sprints.map((s) => (
          <div key={s.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-raised transition-colors">
            <span
              className="w-1 h-4 rounded-full shrink-0"
              style={{ background: s.is_current ? 'var(--color-brand)' : 'var(--color-ink-faint)' }}
            />
            <button
              className={`text-sm font-medium text-left hover:text-brand transition-colors ${s.archived ? 'text-ink-dim' : ''}`}
              onClick={() => open(s)}
              title="Open this sprint on the board"
            >
              {s.name}
            </button>
            {s.is_current && (
              <span className="text-[11px] font-semibold text-brand bg-brand-soft rounded-full px-1.5 py-px">current</span>
            )}
            <span className="flex-1" />
            <span className="text-xs text-ink-faint font-mono whitespace-nowrap">
              {fmtDate(s.start_date)} – {fmtDate(s.end_date)}
            </span>
            <button title="Edit sprint" onClick={() => setEditing(s)}
                    className="text-ink-faint hover:text-ink p-1 rounded-md hover:bg-raised opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-4" />
            </button>
            <button title={s.archived ? 'Unarchive' : 'Archive'}
                    onClick={() => update.mutate({ id: s.id, archived: !s.archived })}
                    className="text-ink-faint hover:text-ink p-1 rounded-md hover:bg-raised opacity-0 group-hover:opacity-100 transition-opacity">
              {s.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            </button>
            <button title="Delete sprint"
                    onClick={() => { if (confirm(`Delete sprint "${s.name}"? Its tasks move to the backlog.`)) del.mutate(s.id) }}
                    className="text-ink-faint hover:text-danger p-1 rounded-md hover:bg-raised opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <EditSprintModal sprint={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function EditSprintModal({ sprint, onClose }: { sprint: Sprint | null; onClose: () => void }) {
  const update = useUpdateSprint()
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  // seed the form when a sprint is opened
  const [seededId, setSeededId] = useState<number | null>(null)
  if (sprint && sprint.id !== seededId) {
    setSeededId(sprint.id)
    setName(sprint.name)
    setStart(sprint.start_date.slice(0, 10))
    setEnd(sprint.end_date.slice(0, 10))
  }

  return (
    <Modal open={sprint !== null} onClose={onClose} title="Edit sprint">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!sprint || !name.trim() || !start || !end) return
          update.mutate({ id: sprint.id, name: name.trim(), start_date: start, end_date: end })
          onClose()
        }}
      >
        <input autoFocus className={inputCls} placeholder="Sprint name" value={name}
               onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts">
            <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ends">
            <input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button kind="primary" type="submit" disabled={!name.trim() || !start || !end}>Save changes</Button>
        </div>
      </form>
    </Modal>
  )
}
