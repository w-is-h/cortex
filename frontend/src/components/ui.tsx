import type { ReactNode } from 'react'
import { Button as ShadButton } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Priority } from '../api/types'

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export const PRIO_COLOR: Record<Priority, string> = {
  low: 'var(--color-prio-low)',
  medium: 'var(--color-prio-medium)',
  high: 'var(--color-prio-high)',
  urgent: 'var(--color-prio-urgent)',
}

/** Deterministic golden-angle hues: per project id / per name or tag. */
export const projectHue = (id: number) => (id * 137.508) % 360
export const nameHue = (s: string) => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (h * 137.508) % 360
}

// Up to two-letter initials from a name. Multi-part names (split on space,
// dot, underscore, hyphen) give the first letter of the first two parts; a
// single-part name gives its first two letters. Collisions are expected and
// disambiguated by the per-name color + tooltip, not by more letters.
export const initials = (name: string) => {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0])
  return (parts[0] ?? '').slice(0, 2)
}

// one row language for every list (tasks, projects, sidebar panels): flat with
// a hairline beneath; hover pops it to a card with a shadow and an accent bar.
// Callers add their own spacing (gap/padding) and pair rowCls with rowHoverCls
// unless the row is in a selected state.
export const rowCls =
  'group relative flex items-center rounded-lg transition-all duration-150 shadow-[0_1px_0_0_var(--color-line)]'
export const rowHoverCls =
  'hover:bg-card hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_-6px_rgba(0,0,0,0.14)] dark:hover:shadow-black/30'

export function RowAccent({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="absolute left-0.5 inset-y-0 my-1 w-[3px] scale-y-0 rounded-full transition-transform duration-150 origin-center group-hover:scale-y-100"
      style={{ background: color }}
    />
  )
}

export function PrioDot({ priority, className = '' }: { priority: Priority; className?: string }) {
  return (
    <span
      title={priority}
      className={`inline-block size-2 rounded-full shrink-0 ${className}`}
      style={{ background: PRIO_COLOR[priority] }}
    />
  )
}

export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  const hue = nameHue(name)
  return (
    <span
      title={name}
      className="inline-flex items-center justify-center rounded-full font-semibold uppercase shrink-0 select-none"
      style={{ width: size, height: size, fontSize: size * 0.42,
               color: `hsl(${hue} 65% 20%)`, background: `hsl(${hue} 65% 62%)` }}
    >
      {initials(name)}
    </span>
  )
}

const KIND_TO_VARIANT = {
  default: 'outline',
  primary: 'brand',
  ghost: 'ghost',
  danger: 'destructive-outline',
} as const

export function Button({
  children, onClick, kind = 'default', type = 'button', disabled, className = '', title,
  size = 'default',
}: {
  children: ReactNode
  onClick?: () => void
  kind?: keyof typeof KIND_TO_VARIANT
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  title?: string
  size?: 'default' | 'sm' | 'lg'
}) {
  const variant = KIND_TO_VARIANT[kind]
  return (
    <ShadButton
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      size={size}
      variant={variant === 'destructive-outline' ? 'outline' : variant}
      className={cn(
        variant === 'destructive-outline' && 'text-danger hover:text-danger hover:border-danger/40',
        className,
      )}
    >
      {children}
    </ShadButton>
  )
}

// a div, not a <label>: label click-forwarding sends any click in the field to
// its first button — for fields whose first button is a remove ×, that deletes
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="block text-xs font-medium text-ink-dim mb-1">{label}</span>
      {children}
    </div>
  )
}

export const inputCls =
  'h-8 w-full rounded-lg border border-transparent bg-secondary px-2.5 text-sm text-ink ' +
  'placeholder:text-ink-faint transition-colors outline-none ' +
  'focus-visible:bg-card focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'

export interface PickOpt {
  value: string
  label: ReactNode
}

/** Thin wrapper over the shadcn Select for the app's common value/options case. */
export function Pick({
  value, onChange, options, placeholder, className, size = 'default',
}: {
  value: string | null
  onChange: (value: string) => void
  options: PickOpt[]
  placeholder?: string
  className?: string
  size?: 'sm' | 'default'
}) {
  return (
    <Select items={options} value={value} onValueChange={(v) => v !== null && onChange(v as string)}>
      <SelectTrigger size={size} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Modal({
  open, onClose, title, children, wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-ink-faint py-10 text-center">{children}</div>
}

export function timeAgo(iso: string): string {
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime()
  const mins = Math.round((Date.now() - then) / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  return new Date(then).toLocaleDateString()
}

export function fmtDate(iso: string): string {
  return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function SegmentedToggle<T extends string>({
  value, options, onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex bg-raised border border-line rounded-lg p-1 h-9 items-center text-[0.85rem] font-medium">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 h-full rounded-md transition-colors',
            value === o.value
              ? 'bg-primary text-primary-foreground shadow-sm shadow-black/10'
              : 'text-ink-dim hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
