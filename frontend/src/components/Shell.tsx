import {
  ChartNoAxesGantt, Check, ChevronsUpDown, Columns3, House, Inbox, LogOut, Moon,
  Plus, Repeat, Search, Sun, Users,
} from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMe, useSpaces, useCreateSpace, useLogout } from '../api/hooks'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import type { Space, User } from '../api/types'
import { NotificationBell } from './NotificationBell'
import { SearchPalette } from './SearchPalette'
import { Avatar, inputCls, Modal, Button } from './ui'

interface SpaceCtx {
  space: Space
  spaces: Space[]
  setSpaceId: (id: number) => void
  me: User
}

const Ctx = createContext<SpaceCtx | null>(null)

export function useSpace(): SpaceCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSpace outside Shell')
  return ctx
}

export function Logo({ size = 22 }: { size?: number }) {
  // an EEG / neural-pulse trace — cortex = brain activity, techy and high-contrast
  return (
    <svg viewBox="0 0 32 32" style={{ width: size, height: size }} fill="none"
         stroke="var(--color-brand)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 17 H9 L12 17 L15 8 L18.5 24 L21 17 H24" />
      <circle cx="27.5" cy="17" r="2.4" fill="var(--color-brand)" stroke="none" />
    </svg>
  )
}

function NavItem({ to, icon: Icon, label, end }: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 mx-2 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-100 ${
          isActive
            ? 'bg-brand-soft text-brand'
            : 'text-ink-dim hover:text-ink hover:bg-raised'
        }`
      }
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      {label}
    </NavLink>
  )
}

/** Redirect a legacy space-less path into the active space. */
export function SpaceRedirect({ to }: { to: string }) {
  const { space } = useSpace()
  return <Navigate to={`/s/${space.id}/${to}`} replace />
}

export function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const me = useMe()
  const spaces = useSpaces()
  const urlSpaceId = params.spaceId ? Number(params.spaceId) : null
  const [storedSpaceId, setStoredSpaceId] = useState<number>(() =>
    Number(localStorage.getItem('cortex.space') || 0),
  )
  const spaceId = urlSpaceId ?? storedSpaceId
  const [searchOpen, setSearchOpen] = useState(false)
  const [newSpaceOpen, setNewSpaceOpen] = useState(false)

  useEffect(() => {
    if (me.isError) navigate('/login', { replace: true })
  }, [me.isError, navigate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const space = useMemo(
    () => spaces.data?.find((s) => s.id === spaceId) ?? spaces.data?.[0],
    [spaces.data, spaceId],
  )

  if (me.isPending || spaces.isPending || !space || !me.data) {
    return (
      <div className="h-screen grid place-items-center">
        <Logo size={28} />
      </div>
    )
  }

  // keep localStorage in sync with whatever space the URL landed us in
  if (space.id !== storedSpaceId) {
    localStorage.setItem('cortex.space', String(space.id))
  }

  const ctx: SpaceCtx = {
    space,
    spaces: spaces.data!,
    me: me.data,
    setSpaceId: (id) => {
      localStorage.setItem('cortex.space', String(id))
      setStoredSpaceId(id)
      const match = location.pathname.match(/^\/s\/\d+\/(\w+)/)
      if (match) navigate(`/s/${id}/${match[1]}`)
    },
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="h-screen flex overflow-hidden">
        {/* ---------------------------------------------------- sidebar */}
        <aside className="w-56 shrink-0 bg-panel border-r border-line flex flex-col">
          <NavLink to="/" className="flex items-center gap-2.5 px-4 h-14 select-none">
            <Logo />
            <span className="font-semibold tracking-tight text-[1.05rem]">cortex</span>
          </NavLink>

          <div className="px-3 pb-2">
            <SpaceSwitcher onNewSpace={() => setNewSpaceOpen(true)} />
          </div>

          <div className="px-3 pb-3">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2 text-sm text-ink-faint border border-line rounded-lg px-2.5 py-1.5 hover:border-line-strong hover:text-ink-dim transition-colors"
            >
              <Search className="size-3.5" />
              <span className="flex-1 text-left">Search</span>
              <kbd>⌘K</kbd>
            </button>
          </div>

          <nav className="flex flex-col gap-0.5">
            <NavItem to="/" icon={House} label="Home" end />
            <NavItem to={`/s/${space.id}/board`} icon={Columns3} label="Board" />
            <NavItem to={`/s/${space.id}/backlog`} icon={Inbox} label="Backlog" />
            <NavItem to={`/s/${space.id}/sprints`} icon={Repeat} label="Sprints" />
            <NavItem to={`/s/${space.id}/projects`} icon={ChartNoAxesGantt} label="Projects" />
            {me.data.is_admin && <NavItem to="/admin" icon={Users} label="Admin" />}
          </nav>

          <div className="flex-1" />

          <div className="border-t border-line px-2 py-2 flex items-center gap-1">
            <UserMenu />
            <span className="flex-1" />
            <ThemeToggle />
            <NotificationBell />
          </div>
        </aside>

        {/* ---------------------------------------------------- content */}
        <main
          className="flex-1 overflow-y-auto"
          style={{
            background:
              'radial-gradient(900px 300px at 15% -5%, color-mix(in oklab, var(--color-brand) 4%, transparent), transparent), var(--background)',
          }}
        >
          <div className="px-8 py-6 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NewSpaceModal open={newSpaceOpen} onClose={() => setNewSpaceOpen(false)} />
    </Ctx.Provider>
  )
}

/** Pill-shaped space switcher: coloured glyph badge + name + chevron. */
function SpaceSwitcher({ onNewSpace }: { onNewSpace: () => void }) {
  const { space, spaces, setSpaceId } = useSpace()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full flex items-center gap-2.5 rounded-xl border border-line bg-card px-2 py-1.5 hover:bg-raised transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 shadow-sm shadow-black/5 dark:shadow-none">
        <span className="grid place-items-center size-7 rounded-lg bg-brand text-brand-ink font-bold text-sm shrink-0 uppercase">
          {space.name.slice(0, 1)}
        </span>
        <span className="flex-1 text-left text-sm font-semibold truncate">{space.name}</span>
        <ChevronsUpDown className="size-3.5 text-ink-faint shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[13.5rem]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Spaces</DropdownMenuLabel>
          {spaces.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => setSpaceId(s.id)}>
              <span className="grid place-items-center size-5 rounded-md bg-brand text-brand-ink font-bold text-[11px] uppercase shrink-0">
                {s.name.slice(0, 1)}
              </span>
              <span className="flex-1 truncate">{s.name}</span>
              {s.id === space.id && <Check className="size-3.5 text-brand" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onNewSpace}>
          <Plus />
          New space…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      className="grid place-items-center size-8 rounded-lg text-ink-dim hover:text-ink hover:bg-raised transition-colors outline-none"
    >
      {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  )
}

function UserMenu() {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  if (!me.data) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-raised transition-colors max-w-36 outline-none">
        <Avatar name={me.data.username} size={22} />
        <span className="text-sm font-medium truncate">{me.data.username}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {me.data.username}
            {me.data.is_admin && <span className="text-xs text-ink-faint ml-1.5">admin</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await logout.mutateAsync()
            navigate('/login')
          }}
        >
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NewSpaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateSpace()
  const { setSpaceId } = useSpace()
  const [name, setName] = useState('')
  return (
    <Modal open={open} onClose={onClose} title="New space">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          const space = await create.mutateAsync(name.trim())
          setSpaceId(space.id)
          setName('')
          onClose()
        }}
        className="space-y-3"
      >
        <input autoFocus className={inputCls} placeholder="Space name" value={name}
               onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end">
          <Button kind="primary" type="submit" disabled={!name.trim()}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}
