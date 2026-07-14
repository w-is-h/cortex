import { ListFilter } from 'lucide-react'
import { useMemo, useSyncExternalStore } from 'react'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUsers } from '../api/hooks'
import { useStatusDefs } from './statuses'
import { Avatar } from './ui'

/** Global list filters — one setting, remembered, applied to every list.
 *  A module store (not per-component state) so the header menu and the lists
 *  it filters re-render together. */

const KEY = {
  done: 'cortex.filter.done',
  archived: 'cortex.filter.archived',
  users: 'cortex.filter.users',
}
const read = (key: string, dflt: boolean) => {
  const v = localStorage.getItem(key)
  return v == null ? dflt : v === '1'
}
const readIds = (key: string): number[] =>
  (localStorage.getItem(key) ?? '').split(',').filter(Boolean).map(Number)

let state = {
  showDone: read(KEY.done, true),
  showArchived: read(KEY.archived, false),
  userIds: readIds(KEY.users),
}
const subs = new Set<() => void>()

function set(patch: Partial<typeof state>) {
  state = { ...state, ...patch }
  localStorage.setItem(KEY.done, state.showDone ? '1' : '0')
  localStorage.setItem(KEY.archived, state.showArchived ? '1' : '0')
  localStorage.setItem(KEY.users, state.userIds.join(','))
  subs.forEach((fn) => fn())
}

function toggleUser(id: number) {
  const ids = state.userIds.includes(id)
    ? state.userIds.filter((u) => u !== id)
    : [...state.userIds, id]
  set({ userIds: ids })
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

/** People filter on some user-id field; no selection = everyone. */
function useVisibleByPerson<K extends string, T extends Record<K, number | null>>(
  items: T[], key: K,
): T[] {
  const { userIds } = useListFilters()
  return useMemo(
    () => (userIds.length === 0
      ? items
      : items.filter((i) => i[key] != null && userIds.includes(i[key] as number))),
    [items, userIds, key],
  )
}

/** Task lists: the status filter plus the people filter on the assignee. */
export function useVisibleTasks<T extends { status: string; assignee_id: number | null }>(
  items: T[],
): T[] {
  return useVisibleByPerson(useVisibleByStatus(items, 'task'), 'assignee_id')
}

/** Project lists: the status filter plus the people filter on the owner. */
export function useVisibleProjects<T extends { status: string; owner_id: number | null }>(
  items: T[],
): T[] {
  return useVisibleByPerson(useVisibleByStatus(items, 'project'), 'owner_id')
}

/** Funnel dropdown for the page header; pages opt into the toggles that apply. */
export function FilterMenu({ done = true, archived = false, users = false }: {
  done?: boolean
  archived?: boolean
  users?: boolean
}) {
  const filters = useListFilters()
  const allUsers = useUsers()
  const active = (allUsers.data ?? []).filter((u) => u.is_active)
  const filtering =
    (done && !filters.showDone) ||
    (archived && filters.showArchived) ||
    (users && filters.userIds.length > 0)
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
        {users && active.length > 0 && (
          <>
            {done && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel>People</DropdownMenuLabel>
              {active.map((u) => (
                <DropdownMenuCheckboxItem
                  key={u.id}
                  checked={filters.userIds.includes(u.id)}
                  onCheckedChange={() => toggleUser(u.id)}
                >
                  <Avatar name={u.username} size={18} />
                  {u.username}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
