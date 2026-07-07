import { X } from 'lucide-react'
import { useRef, useState } from 'react'

/** Mirror of the backend's norm_tags: lowercase, no '#', hyphens for spaces. */
export const normTag = (s: string) => s.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-')

export function TagChip({ tag, active, onClick, onRemove }: {
  tag: string
  active?: boolean
  onClick?: () => void
  onRemove?: () => void
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-1.5 py-px transition-colors ${
        active ? 'bg-brand text-brand-ink' : 'bg-raised text-ink-dim'
      } ${onClick ? 'cursor-pointer hover:text-ink' : ''}`}
      onClick={onClick && ((e) => { e.preventDefault(); e.stopPropagation(); onClick() })}
    >
      #{tag}
      {onRemove && (
        <button className="hover:text-danger -mr-0.5" onClick={(e) => { e.stopPropagation(); onRemove() }}>
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

/** Chips + input; typing (or '#') suggests from `vocab`, Enter/Tab commits,
 *  backspace on an empty input removes the last tag. */
export function TagsEditor({ tags, vocab, onChange }: {
  tags: string[]
  vocab: string[]
  onChange: (tags: string[]) => void
}) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = normTag(text)
  const suggestions = focused
    ? vocab.filter((t) => !tags.includes(t) && t.startsWith(query)).slice(0, 8)
    : []

  const add = (raw: string) => {
    const tag = normTag(raw)
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setText('')
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-9 rounded-md border border-line bg-panel px-2 py-1.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t) => (
          <TagChip key={t} tag={t} onRemove={() => onChange(tags.filter((x) => x !== t))} />
        ))}
        <input
          ref={inputRef}
          className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          placeholder={tags.length ? '' : '#add-tag'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); if (text.trim()) add(text) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              if (text.trim()) { e.preventDefault(); add(text) }
              else if (e.key === 'Tab' && suggestions.length) { e.preventDefault(); add(suggestions[0]) }
            }
            if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1))
            if (e.key === 'Escape') inputRef.current?.blur()
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-line bg-card shadow-lg py-1">
          {suggestions.map((t) => (
            <button
              key={t}
              className="block w-full text-left px-2.5 py-1 text-sm text-ink-dim hover:bg-raised hover:text-ink"
              onMouseDown={(e) => { e.preventDefault(); add(t) }}
            >
              #{t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
