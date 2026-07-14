import { Paperclip, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { uploadFile, useUsers } from '../api/hooks'
import { Markdown, toggleCheckbox } from './Markdown'
import { Avatar, Button } from './ui'

export type MarkdownEditorProps = {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  onSubmit?: () => void
  onEscape?: () => void
  placeholder?: string
  minRows?: number
  autoFocus?: boolean
}

/** Upload files and return the markdown that embeds them: images inline, the rest as links. */
async function filesToMarkdown(files: FileList): Promise<string> {
  const parts: string[] = []
  for (const f of [...files]) {
    const { url } = await uploadFile(f)
    parts.push(f.type.startsWith('image/') ? `![${f.name || 'image'}](${url})` : `[${f.name || 'file'}](${url})`)
  }
  return parts.join('\n')
}

/** While the native file dialog is open the window deactivates and Chrome fires
 *  blur on the focused textarea — save-on-blur must not close the editor behind
 *  the dialog (the picked file would land on an unmounted input). Only one
 *  native dialog can be open at a time, so a module flag suffices. */
let filePickerOpen = false

/** Paperclip button + hidden file input; mousedown is swallowed so the textarea keeps focus. */
function AttachButton({ onFiles }: { onFiles: (files: FileList) => void }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // 'cancel' (dialog dismissed) isn't in React's input types
    const el = input.current
    const reset = () => { filePickerOpen = false }
    el?.addEventListener('cancel', reset)
    return () => el?.removeEventListener('cancel', reset)
  }, [])
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          filePickerOpen = false
          if (e.target.files?.length) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        title="Attach files"
        className="p-1 rounded-md text-ink-faint hover:text-ink hover:bg-raised transition-colors"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { filePickerOpen = true; input.current?.click() }}
      >
        <Paperclip className="size-3.5" />
      </button>
    </>
  )
}

/** Pixel position of `pos` inside the textarea, via an offscreen mirror div
 *  that clones the metrics that affect text layout. */
function caretXY(el: HTMLTextAreaElement, pos: number) {
  const div = document.createElement('div')
  const style = getComputedStyle(el)
  for (const p of [
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'boxSizing',
  ] as const) div.style[p] = style[p]
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.wordWrap = 'break-word'
  div.style.width = `${el.clientWidth}px`
  div.textContent = el.value.slice(0, pos)
  const marker = document.createElement('span')
  marker.textContent = '​'
  div.appendChild(marker)
  document.body.appendChild(div)
  const xy = { x: marker.offsetLeft, y: marker.offsetTop + marker.offsetHeight - el.scrollTop }
  div.remove()
  return xy
}

type MentionState = { start: number; query: string; x: number; y: number }

/** Plain-markdown textarea: auto-grows, pasted/dropped/attached files upload and
 *  insert as markdown, @ pops user autocomplete at the caret.
 *  Enter submits when onSubmit is set (Shift+Enter = newline). */
export function MarkdownEditor({ bare, ...props }: MarkdownEditorProps & { bare?: boolean }) {
  const { value, onChange, onBlur, onSubmit, onEscape, placeholder, minRows = 4, autoFocus } = props
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<MentionState | null>(null)
  const [sel, setSel] = useState(0)
  const users = useUsers()
  const matches = mention
    ? (users.data ?? [])
        .filter((u) => u.is_active && u.username.toLowerCase().startsWith(mention.query.toLowerCase()))
        .slice(0, 6)
    : []

  /** Active when the caret sits right after "@word" at a word boundary. */
  const updateMention = () => {
    const el = ref.current
    if (!el) return
    const m = /(?:^|\s)@([\w-]*)$/.exec(el.value.slice(0, el.selectionStart))
    if (!m) { setMention(null); return }
    const start = el.selectionStart - m[1].length - 1
    setSel(0)
    setMention({ start, query: m[1], ...caretXY(el, start) })
  }

  const acceptMention = (username: string) => {
    const el = ref.current
    if (!el || !mention) return
    const pos = mention.start + username.length + 2
    onChange(`${value.slice(0, mention.start)}@${username} ${value.slice(el.selectionStart)}`)
    setMention(null)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos) })
  }

  const autoGrow = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(autoGrow, [value])

  const insertAtCursor = (text: string) => {
    const el = ref.current
    const at = el ? el.selectionStart : value.length
    onChange(value.slice(0, at) + text + value.slice(at))
  }

  const uploadFiles = async (files: FileList) => insertAtCursor(await filesToMarkdown(files))

  const textarea = (
    <textarea
      ref={ref}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      style={{ minHeight: `${minRows * 1.6}em` }}
      className={`w-full resize-none bg-transparent text-[1.0625rem] leading-relaxed outline-none placeholder:text-ink-faint ${
        bare ? '' : 'px-3 py-2'
      }`}
      onChange={(e) => { onChange(e.target.value); updateMention() }}
      onInput={autoGrow}
      onClick={updateMention}
      onBlur={() => { setMention(null); onBlur?.() }}
      onPaste={(e) => {
        if (e.clipboardData?.files.length) { e.preventDefault(); uploadFiles(e.clipboardData.files) }
      }}
      onDrop={(e) => {
        if (e.dataTransfer?.files.length) { e.preventDefault(); uploadFiles(e.dataTransfer.files) }
      }}
      onKeyDown={(e) => {
        if (mention && matches.length) {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % matches.length); return }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s + matches.length - 1) % matches.length); return }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptMention(matches[sel].username); return }
          if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
        }
        if (onSubmit && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() }
        if (onEscape && e.key === 'Escape') onEscape()
      }}
    />
  )

  const editor = (
    <div className="relative">
      {textarea}
      {mention && matches.length > 0 && (
        <div
          className="absolute z-50 min-w-40 rounded-md border border-line bg-panel shadow-md py-1"
          style={{
            left: Math.min(mention.x, (ref.current?.clientWidth ?? 320) - 170),
            top: mention.y + 4,
          }}
        >
          {matches.map((u, i) => (
            <button
              key={u.id}
              type="button"
              className={`w-full flex items-center gap-2 px-2.5 py-1 text-sm text-left transition-colors ${
                i === sel ? 'bg-raised text-ink' : 'text-ink-dim'
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSel(i)}
              onClick={() => acceptMention(u.username)}
            >
              <Avatar name={u.username} size={18} />
              {u.username}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  if (bare) return editor
  return (
    <div className="border border-line-strong rounded-lg bg-panel focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      {editor}
      <div className="flex items-center justify-between pl-1.5 pr-2.5 py-0.5 border-t border-line select-none">
        <AttachButton onFiles={uploadFiles} />
        {onSubmit && (
          <div className="text-[11px] text-ink-faint">↵ send · ⇧↵ newline · @mention</div>
        )}
      </div>
    </div>
  )
}

/** Edit-markdown / done / rendered-markdown flow for task & project descriptions.
 *  View mode renders markdown (checkboxes clickable, saved straight through);
 *  the hover pencil opens the editor; blur or Done saves. */
export function DescriptionEditor({ value, onSave, placeholder = 'Add a description…' }: {
  value: string
  onSave: (md: string) => void
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  const save = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (editing) {
    return (
      <div>
        <div className="rounded-md bg-raised/60 px-3 py-2">
          <MarkdownEditor bare value={draft} onChange={setDraft}
                          onBlur={() => { if (!filePickerOpen) save() }}
                          autoFocus placeholder={placeholder} />
        </div>
        <div className="flex justify-end items-center gap-2 mt-2">
          <AttachButton onFiles={async (files) => {
            const md = await filesToMarkdown(files)
            setDraft((d) => (d.trim() ? `${d}\n${md}` : md))
          }} />
          {/* the textarea's blur fires first and does the save; this is the affordance */}
          <Button kind="primary" onClick={save}>Done</Button>
        </div>
      </div>
    )
  }

  if (!value.trim()) {
    return (
      <button className="text-sm text-ink-faint hover:text-ink-dim transition-colors"
              onClick={() => setEditing(true)}>
        {placeholder}
      </button>
    )
  }

  return (
    <div className="group/desc relative">
      <button
        className="absolute right-0 top-0 p-1 rounded-md text-ink-faint hover:text-ink hover:bg-raised opacity-0 group-hover/desc:opacity-100 transition-opacity"
        title="Edit description"
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-3.5" />
      </button>
      <Markdown onToggleCheckbox={(i, checked) => onSave(toggleCheckbox(value, i, checked))}>
        {value}
      </Markdown>
    </div>
  )
}
