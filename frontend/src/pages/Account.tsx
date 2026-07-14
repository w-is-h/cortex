import { useState } from 'react'
import { useApiKeyMutations, useApiKeys } from '../api/hooks'
import { Button, inputCls, timeAgo } from '../components/ui'

/** Personal page — reachable by every user from the user menu. */
export function Account() {
  return (
    <div className="max-w-2xl space-y-10">
      <ApiKeys />
    </div>
  )
}

export function ApiKeys() {
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
