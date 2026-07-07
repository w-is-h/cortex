import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMarkRead, useNotifications } from '../api/hooks'
import type { Notification } from '../api/types'
import { timeAgo } from './ui'

const VERB: Record<Notification['type'], string> = {
  assigned: 'assigned you',
  status_changed: 'changed status of',
  commented: 'commented on',
  mentioned: 'mentioned you on',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const box = useNotifications(true)
  const markRead = useMarkRead()
  const unread = box.data?.unread ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative p-2 rounded-lg text-ink-dim hover:text-ink hover:bg-raised transition-colors outline-none"
        title="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-0.5 rounded-full bg-prio-urgent text-white text-[10px] font-semibold grid place-items-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent side="right" align="end" className="w-96 p-0 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b border-line sticky top-0 bg-popover z-10">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-dim">Notifications</span>
          {unread > 0 && (
            <button className="text-xs text-brand hover:underline" onClick={() => markRead.mutate(null)}>
              mark all read
            </button>
          )}
        </div>
        {!box.data?.items.length && (
          <div className="text-sm text-ink-faint text-center py-8">Nothing yet.</div>
        )}
        {box.data?.items.map((n) => (
          <Link
            key={n.id}
            to={n.task_id ? `/tasks/${n.task_id}` : n.project_id ? `/projects/${n.project_id}` : '#'}
            onClick={() => {
              setOpen(false)
              if (!n.read_at) markRead.mutate([n.id])
            }}
            className={`block px-3 py-2 text-sm border-b border-line last:border-0 hover:bg-raised transition-colors ${
              n.read_at ? 'text-ink-dim' : ''
            }`}
          >
            <span className="flex items-start gap-2">
              {!n.read_at && <span className="size-1.5 rounded-full bg-brand mt-1.5 shrink-0" />}
              <span className={n.read_at ? 'ml-3.5' : ''}>
                <span className="font-medium">{n.actor_username}</span>{' '}
                {VERB[n.type]}{' '}
                <span className="font-medium">{n.task_title ?? n.project_title ?? '—'}</span>
                <span className="text-ink-faint ml-1.5 font-mono text-xs">{timeAgo(n.created_at)}</span>
              </span>
            </span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  )
}
