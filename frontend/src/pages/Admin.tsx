import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  useApiKeyMutations, useApiKeys, useDeleteSpace, useUpdateSpace, useUserAdmin, useUsers,
} from '../api/hooks'
import { useSpace } from '../components/Shell'
import { Avatar, Button, inputCls, Pick, timeAgo } from '../components/ui'

export function Admin() {
  const { me } = useSpace()
  if (!me.is_admin) return <div className="text-sm text-ink-faint py-10 text-center">Admins only.</div>
  return (
    <div className="max-w-2xl space-y-10">
      <Users />
      <SpaceSettings />
      <ApiKeys />
    </div>
  )
}

function SpaceSettings() {
  const { space, spaces, setSpaceId } = useSpace()
  const update = useUpdateSpace()
  const del = useDeleteSpace()
  const onDelete = async () => {
    if (!confirm(`Delete space "${space.name}" and everything in it — tasks, projects, sprints, comments? This cannot be undone.`)) return
    await del.mutateAsync(space.id)
    const survivor = spaces.find((s) => s.id !== space.id)
    if (survivor) setSpaceId(survivor.id)
  }
  return (
    <section>
      <h1 className="text-base font-semibold mb-3">Space — {space.name}</h1>
      <div className="border border-line rounded-lg bg-panel divide-y divide-line">
        <div className="flex items-center gap-3 px-3 py-2.5">
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
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="text-sm font-medium">Delete this space</span>
          <span className="text-xs text-ink-faint">removes all its tasks, projects and sprints</span>
          <span className="flex-1" />
          <Button kind="danger" disabled={spaces.length < 2} onClick={onDelete}>Delete</Button>
        </div>
      </div>
      {del.isError && (
        <p className="text-sm text-danger mt-2">{(del.error as Error).message}</p>
      )}
    </section>
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
