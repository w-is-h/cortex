import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useApiKeyMutations, useApiKeys, useCreateStatus, useDeleteStatus, useStatuses,
  useUpdateSpace, useUpdateStatus, useUserAdmin, useUsers,
} from '../api/hooks'
import type { StatusDef } from '../api/types'
import { useSpace } from '../components/Shell'
import { Avatar, Button, inputCls, Pick, timeAgo } from '../components/ui'

export function Admin() {
  const { me, space } = useSpace()
  if (!me.is_admin) return <div className="text-sm text-ink-faint py-10 text-center">Admins only.</div>
  return (
    <div className="max-w-2xl space-y-10">
      <Users />
      <SpaceSettings />
      <section>
        <h1 className="text-base font-semibold mb-1">Statuses</h1>
        <p className="text-sm text-ink-dim mb-3">
          Per-space status columns for <b>{space.name}</b>. Order sets the board columns;
          the “done” flag drives completion (strikethrough, project progress).
        </p>
        <div className="space-y-6">
          <StatusKindEditor kind="task" title="Task statuses" />
          <StatusKindEditor kind="project" title="Project statuses" />
        </div>
      </section>
      <ApiKeys />
    </div>
  )
}

function SpaceSettings() {
  const { space } = useSpace()
  const update = useUpdateSpace()
  return (
    <section>
      <h1 className="text-base font-semibold mb-3">Space</h1>
      <div className="flex items-center gap-3 border border-line rounded-lg bg-panel px-3 py-2.5">
        <span className="text-sm font-medium">Default sprint length</span>
        <span className="flex-1" />
        <Pick
          className="w-36"
          value={String(space.default_sprint_days)}
          onChange={(v) => update.mutate({ id: space.id, default_sprint_days: Number(v) })}
          options={[
            { value: '7', label: '1 week' },
            { value: '14', label: '2 weeks' },
            { value: '21', label: '3 weeks' },
            { value: '28', label: '4 weeks' },
          ]}
        />
      </div>
    </section>
  )
}

function StatusKindEditor({ kind, title }: { kind: 'task' | 'project'; title: string }) {
  const { space } = useSpace()
  const q = useStatuses(space.id, kind)
  const create = useCreateStatus()
  const update = useUpdateStatus()
  const del = useDeleteStatus()
  const list = q.data ?? []
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#8b949e')

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    update.mutate({ id: list[i].id, sort_order: list[j].sort_order })
    update.mutate({ id: list[j].id, sort_order: list[i].sort_order })
  }

  return (
    <div>
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-ink-dim mb-2">{title}</h2>
      <div className="border border-line rounded-lg overflow-hidden bg-panel divide-y divide-line">
        {list.map((s, i) => (
          <StatusRow
            key={s.id} status={s} others={list.filter((o) => o.id !== s.id)}
            canReorder={list.length > 1} isFirst={i === 0} isLast={i === list.length - 1}
            onMove={(dir) => move(i, dir)}
            onUpdate={(patch) => update.mutate({ id: s.id, ...patch })}
            onDelete={(reassignTo) => del.mutate({ id: s.id, reassignTo })}
            canDelete={list.length > 1}
          />
        ))}
      </div>
      <form
        className="flex gap-2 mt-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!label.trim()) return
          await create.mutateAsync({ space_id: space.id, kind, label: label.trim(), color })
          setLabel('')
        }}
      >
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
               className="h-8 w-9 rounded-md bg-transparent cursor-pointer" title="Colour" />
        <input className={inputCls} placeholder={`new ${kind} status…`} value={label}
               onChange={(e) => setLabel(e.target.value)} />
        <Button kind="primary" type="submit" disabled={!label.trim()}>Add</Button>
      </form>
    </div>
  )
}

function StatusRow({
  status, others, canReorder, isFirst, isLast, onMove, onUpdate, onDelete, canDelete,
}: {
  status: StatusDef
  others: StatusDef[]
  canReorder: boolean
  isFirst: boolean
  isLast: boolean
  onMove: (dir: -1 | 1) => void
  onUpdate: (patch: Partial<StatusDef>) => void
  onDelete: (reassignTo?: number) => void
  canDelete: boolean
}) {
  const [label, setLabel] = useState(status.label)
  const [confirming, setConfirming] = useState(false)
  const [reassign, setReassign] = useState(String(others[0]?.id ?? ''))

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {canReorder && (
        <span className="flex flex-col -my-1 text-ink-faint">
          <button disabled={isFirst} onClick={() => onMove(-1)} className="hover:text-ink disabled:opacity-30"><ChevronUp className="size-3.5" /></button>
          <button disabled={isLast} onClick={() => onMove(1)} className="hover:text-ink disabled:opacity-30"><ChevronDown className="size-3.5" /></button>
        </span>
      )}
      <input type="color" value={status.color} onChange={(e) => onUpdate({ color: e.target.value })}
             className="h-6 w-7 rounded bg-transparent cursor-pointer shrink-0" title="Colour" />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() && label !== status.label) onUpdate({ label: label.trim() }); else setLabel(status.label) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none focus:border-b focus:border-brand"
      />
      <label className="text-xs text-ink-dim flex items-center gap-1.5 cursor-pointer">
        <Checkbox checked={status.is_done} onCheckedChange={(c) => onUpdate({ is_done: c === true })} />
        done
      </label>
      {confirming ? (
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-ink-faint">move to</span>
          <Pick value={reassign} onChange={setReassign} size="sm"
                options={others.map((o) => ({ value: String(o.id), label: o.label }))} />
          <Button kind="danger" onClick={() => { onDelete(Number(reassign)); setConfirming(false) }}>Delete</Button>
          <Button kind="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
        </span>
      ) : (
        canDelete && (
          <button className="text-ink-faint hover:text-danger p-1" title="Delete status"
                  onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" />
          </button>
        )
      )}
    </div>
  )
}

function Users() {
  const users = useUsers()
  const { me } = useSpace()
  const admin = useUserAdmin()
  const [username, setUsername] = useState('')

  return (
    <section>
      <h1 className="text-base font-semibold mb-3">Users</h1>
      <form
        className="flex gap-2 mb-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!username.trim()) return
          await admin.create.mutateAsync({ username: username.trim() })
          setUsername('')
        }}
      >
        <input className={inputCls} placeholder="new username" value={username}
               onChange={(e) => setUsername(e.target.value)} />
        <Button kind="primary" type="submit" disabled={!username.trim()}>Add user</Button>
      </form>
      {admin.create.isError && (
        <p className="text-sm text-danger mb-2">{(admin.create.error as Error).message}</p>
      )}
      <div className="border border-line rounded-lg overflow-hidden bg-panel divide-y divide-line">
        {users.data?.map((u) => (
          <div key={u.id} className={`flex items-center gap-3 px-3 py-2 ${u.is_active ? '' : 'opacity-50'}`}>
            <Avatar name={u.username} />
            <span className="flex-1 text-sm font-medium">{u.username}</span>
            <label className="text-xs text-ink-dim flex items-center gap-1.5 cursor-pointer">
              <Checkbox
                checked={u.is_admin}
                disabled={u.id === me.id}
                onCheckedChange={(c) => admin.update.mutate({ id: u.id, is_admin: c === true })}
              />
              admin
            </label>
            <Button
              kind={u.is_active ? 'danger' : 'default'}
              disabled={u.id === me.id}
              onClick={() => admin.update.mutate({ id: u.id, is_active: !u.is_active })}
            >
              {u.is_active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}

function ApiKeys() {
  const keys = useApiKeys()
  const { create, revoke } = useApiKeyMutations()
  const [name, setName] = useState('')
  const [freshKey, setFreshKey] = useState<string | null>(null)

  return (
    <section>
      <h1 className="text-base font-semibold mb-1">Your API keys</h1>
      <p className="text-sm text-ink-dim mb-3">
        For agents and scripts — REST (<code className="font-mono text-xs">Authorization: Bearer …</code>)
        and MCP at <code className="font-mono text-xs">/mcp</code>. Keys act as you.
      </p>
      <form
        className="flex gap-2 mb-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          const created = await create.mutateAsync(name.trim())
          setFreshKey(created.key ?? null)
          setName('')
        }}
      >
        <input className={inputCls} placeholder="key name, e.g. claude" value={name}
               onChange={(e) => setName(e.target.value)} />
        <Button kind="primary" type="submit" disabled={!name.trim()}>Create key</Button>
      </form>
      {freshKey && (
        <div className="border border-brand/40 bg-brand-soft/40 rounded-md px-3 py-2 mb-3 text-sm">
          <span className="block text-xs text-ink-dim mb-1">Copy it now — it won't be shown again:</span>
          <code className="font-mono text-[0.8rem] break-all select-all">{freshKey}</code>
        </div>
      )}
      <div className="border border-line rounded-lg overflow-hidden bg-panel divide-y divide-line">
        {!keys.data?.length && <div className="text-sm text-ink-faint px-3 py-4">No keys yet.</div>}
        {keys.data?.map((k) => (
          <div key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="font-medium">{k.name}</span>
            <code className="font-mono text-xs text-ink-faint">{k.prefix}…</code>
            <span className="flex-1" />
            <span className="text-xs text-ink-faint font-mono">
              {k.last_used_at ? `used ${timeAgo(k.last_used_at)}` : 'never used'}
            </span>
            <Button kind="danger" onClick={() => revoke.mutate(k.id)}>Revoke</Button>
          </div>
        ))}
      </div>
    </section>
  )
}
