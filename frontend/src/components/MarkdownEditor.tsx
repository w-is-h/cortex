import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { uploadImage } from '../api/hooks'
import { Markdown, toggleCheckbox } from './Markdown'
import { Button } from './ui'

export type MarkdownEditorProps = {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  onSubmit?: () => void
  placeholder?: string
  minRows?: number
  autoFocus?: boolean
}

/** Plain-markdown textarea: auto-grows, pasted or dropped images upload and
 *  insert as markdown. Enter submits when onSubmit is set (Shift+Enter = newline). */
export function MarkdownEditor({ bare, ...props }: MarkdownEditorProps & { bare?: boolean }) {
  const { value, onChange, onBlur, onSubmit, placeholder, minRows = 4, autoFocus } = props
  const ref = useRef<HTMLTextAreaElement>(null)

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

  const uploadFiles = async (files: FileList) => {
    for (const f of [...files]) {
      if (!f.type.startsWith('image/')) continue
      const { url } = await uploadImage(f)
      insertAtCursor(`![${f.name || 'image'}](${url})`)
    }
  }

  const textarea = (
    <textarea
      ref={ref}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      style={{ minHeight: `${minRows * 1.6}em` }}
      className={`w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-ink-faint ${
        bare ? '' : 'px-3 py-2'
      }`}
      onChange={(e) => onChange(e.target.value)}
      onInput={autoGrow}
      onBlur={onBlur}
      onPaste={(e) => {
        if (e.clipboardData?.files.length) { e.preventDefault(); uploadFiles(e.clipboardData.files) }
      }}
      onDrop={(e) => {
        if (e.dataTransfer?.files.length) { e.preventDefault(); uploadFiles(e.dataTransfer.files) }
      }}
      onKeyDown={(e) => {
        if (onSubmit && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() }
      }}
    />
  )

  if (bare) return textarea
  return (
    <div className="border border-line-strong rounded-lg bg-panel overflow-hidden focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      {textarea}
      {onSubmit && (
        <div className="px-2.5 py-1 text-[11px] text-ink-faint text-right border-t border-line select-none">
          ↵ send · ⇧↵ newline · @mention
        </div>
      )}
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
        <div className="border border-line-strong rounded-lg bg-panel px-3 py-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <MarkdownEditor bare value={draft} onChange={setDraft} onBlur={save}
                          autoFocus placeholder={placeholder} />
        </div>
        <div className="flex justify-end mt-2">
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
