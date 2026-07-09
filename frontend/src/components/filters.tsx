import { ListFilter } from 'lucide-react'
import { useMemo, useSyncExternalStore } from 'react'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStatusDefs } from './statuses'

/** Global list filters — one setting, remembered, applied to every list.
 *  A module store (not per-component state) so the header menu and the lists
 *  it filters re-render together. */

const KEY = { done: 'cortex.filter.done', archived: 'cortex.filter.archived' }
const read = (key: string, dflt: boolean) => {
  const v = localStorage.getItem(key)
  return v == null ? dflt : v === '1'
}

let state = { showDone: read(KEY.done, true), showArchived: read(KEY.archived, false) }
const subs = new Set<() => void>()

function set(patch: Partial<typeof state>) {
  state = { ...state, ...patch }
  localStorage.setItem(KEY.done, state.showDone ? '1' : '0')
  localStorage.setItem(KEY.archived, state.showArchived ? '1' : '0')
  subs.forEach((fn) => fn())
}

export function useListFilters() {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb) },
    () => state,
  )
}

/** Drop items whose status is a done status, unless "show done" is on. */
export function useVisibleByStatus<T extends { status: string }>(
  items: T[], kind: 'task' | 'project',
): T[] {
  const { showDone } = useListFilters()
  const { doneKeys } = useStatusDefs(kind)
  return useMemo(
    () => (showDone ? items : items.filter((i) => !doneKeys.has(i.status))),
    [items, showDone, doneKeys],
  )
}

/** Funnel dropdown for the page header; pages opt into the toggles that apply. */
export function FilterMenu({ done = true, archived = false }: { done?: boolean; archived?: boolean }) {
  const filters = useListFilters()
  const filtering = (done && !filters.showDone) || (archived && filters.showArchived)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Filters"
        className={`p-1.5 rounded-md outline-none transition-colors ${
          filtering ? 'text-brand bg-brand-soft' : 'text-ink-faint hover:text-ink hover:bg-raised'
        }`}
      >
        <ListFilter className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {done && (
          <DropdownMenuCheckboxItem
            checked={filters.showDone}
            onCheckedChange={(c) => set({ showDone: c === true })}
          >
            Show done
          </DropdownMenuCheckboxItem>
        )}
        {archived && (
          <DropdownMenuCheckboxItem
            checked={filters.showArchived}
            onCheckedChange={(c) => set({ showArchived: c === true })}
          >
            Show archived
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
