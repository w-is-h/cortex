import { ListFilter } from 'lucide-react'
import { useMemo, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUsers } from '../api/hooks'
import { useStatusDefs } from './statuses'
import { Avatar } from './ui'

/** List filters — remembered and applied to every list. A module store (not
 *  per-component state) so the header menu and the lists it filters re-render
 *  together. show-done is remembered per tab (projects, board, backlog, …);
 *  the rest is global. */

const KEY = {
  done: 'cortex.filter.done', // + '.<scope>'
  archived: 'cortex.filter.archived',
  empty: 'cortex.filter.empty',
  users: 'cortex.filter.users',
}
const read = (key: string, dflt: boolean) => {
  const v = localStorage.getItem(key)
  return v == null ? dflt : v === '1'
}
const readIds = (key: string): number[] =>
  (localStorage.getItem(key) ?? '').split(',').filter(Boolean).map(Number)

// the tab a route belongs to: '/' → home, '/projects/5' → projects,
// '/s/1/board' → board (space-scoped routes carry an /s/:spaceId prefix)
const scopeOf = (pathname: string) => {
  const seg = pathname.split('/').filter(Boolean)
  return (seg[0] === 's' ? seg[2] : seg[0]) || 'home'
}

let state = {
  done: {} as Record<string, boolean>, // per-tab, read lazily
  showArchived: read(KEY.archived, false),
  showEmpty: read(KEY.empty, true),
  userIds: readIds(KEY.users),
}
const subs = new Set<() => void>()

function setDone(scope: string, v: boolean) {
  state = { ...state, done: { ...state.done, [scope]: v } }
  localStorage.setItem(`${KEY.done}.${scope}`, v ? '1' : '0')
  subs.forEach((fn) => fn())
}

function set(patch: Partial<Pick<typeof state, 'showArchived' | 'showEmpty' | 'userIds'>>) {
  state = { ...state, ...patch }
  localStorage.setItem(KEY.archived, state.showArchived ? '1' : '0')
  localStorage.setItem(KEY.empty, state.showEmpty ? '1' : '0')
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
  const { pathname } = useLocation()
  const s = useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb) },
    () => state,
  )
  return {
    showDone: s.done[scopeOf(pathname)] ?? read(`${KEY.done}.${scopeOf(pathname)}`, true),
    showArchived: s.showArchived,
    showEmpty: s.showEmpty,
    userIds: s.userIds,
  }
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

/** Project lists: status + people (owner) filters, plus the empty-project toggle. */
export function useVisibleProjects<T extends {
  status: string; owner_id: number | null; total_tasks: number
}>(items: T[]): T[] {
  const { showEmpty } = useListFilters()
  const visible = useVisibleByPerson(useVisibleByStatus(items, 'project'), 'owner_id')
  return useMemo(
    () => (showEmpty ? visible : visible.filter((p) => p.total_tasks > 0)),
    [visible, showEmpty],
  )
}

/** Funnel dropdown for the page header; pages opt into the toggles that apply. */
export function FilterMenu({ done = true, archived = false, empty = false, users = false }: {
  done?: boolean
  archived?: boolean
  empty?: boolean
  users?: boolean
}) {
  const filters = useListFilters()
  const { pathname } = useLocation()
  const allUsers = useUsers()
  const active = (allUsers.data ?? []).filter((u) => u.is_active)
  const filtering =
    (done && !filters.showDone) ||
    (archived && filters.showArchived) ||
    (empty && !filters.showEmpty) ||
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
      <DropdownMenuContent align="end" className="min-w-64">
        {done && (
          <DropdownMenuCheckboxItem
            checked={filters.showDone}
            onCheckedChange={(c) => setDone(scopeOf(pathname), c === true)}
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
        {empty && (
          <DropdownMenuCheckboxItem
            checked={filters.showEmpty}
            onCheckedChange={(c) => set({ showEmpty: c === true })}
          >
            Show empty
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
