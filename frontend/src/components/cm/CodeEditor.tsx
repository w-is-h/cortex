import { autocompletion, completionStatus, type CompletionContext } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { GFM } from '@lezer/markdown'
import { useEffect, useRef } from 'react'
import { uploadImage, useUsers } from '../../api/hooks'
import { livePreview } from './livePreview'

export interface CodeEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  minRows?: number
  onSubmit?: () => void
  onBlur?: () => void
}

function theme(minRows: number) {
  return EditorView.theme({
    '&': { backgroundColor: 'transparent', color: 'var(--foreground)', fontSize: '0.925rem' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-sans)', lineHeight: '1.6' },
    '.cm-content': {
      fontFamily: 'var(--font-sans)',
      padding: '0.5rem 0.75rem',
      minHeight: `${minRows * 1.6}em`,
      caretColor: 'var(--brand)',
    },
    '.cm-line': { padding: '0 2px' },
    '.cm-placeholder': { color: 'var(--ink-faint)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'color-mix(in oklab, var(--brand) 22%, transparent)',
    },
    // rendered markdown
    '.cm-heading': { fontWeight: '600', lineHeight: '1.3' },
    '.cm-h1': { fontSize: '1.55em' },
    '.cm-h2': { fontSize: '1.35em' },
    '.cm-h3': { fontSize: '1.18em' },
    '.cm-h4, .cm-h5, .cm-h6': { fontSize: '1.05em' },
    '.cm-strong': { fontWeight: '700' },
    '.cm-em': { fontStyle: 'italic' },
    '.cm-strike': { textDecoration: 'line-through', color: 'var(--ink-dim)' },
    '.cm-inline-code': {
      fontFamily: 'var(--font-mono)', fontSize: '0.85em',
      background: 'var(--brand-soft)', borderRadius: '4px', padding: '0.05em 0.3em',
    },
    '.cm-link': { color: 'var(--brand)', textDecoration: 'underline', textDecorationColor: 'color-mix(in oklab, var(--brand) 40%, transparent)' },
    '.cm-blockquote': {
      borderLeft: '2px solid var(--line-strong)', paddingLeft: '0.75rem', color: 'var(--ink-dim)',
    },
    '.cm-codeblock': {
      fontFamily: 'var(--font-mono)', fontSize: '0.85em',
      background: 'var(--muted)',
    },
    '.cm-bullet': { color: 'var(--ink-faint)' },
    '.cm-task-checkbox': { marginRight: '0.15rem', verticalAlign: 'middle', cursor: 'pointer', accentColor: 'var(--brand)' },
    '.cm-img': { maxHeight: '240px', maxWidth: '100%', borderRadius: '8px', margin: '4px 0', cursor: 'zoom-in', border: '1px solid var(--border)' },
  })
}

export default function CodeEditor({
  value, onChange, placeholder, autoFocus, minRows = 4, onSubmit, onBlur,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const users = useUsers()

  // live refs so the (once-created) editor always sees fresh callbacks/data
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const onBlurRef = useRef(onBlur)
  const usersRef = useRef<string[]>([])
  onChangeRef.current = onChange
  onSubmitRef.current = onSubmit
  onBlurRef.current = onBlur
  usersRef.current = (users.data ?? []).filter((u) => u.is_active).map((u) => u.username)

  useEffect(() => {
    if (!host.current) return

    const mentionSource = (ctx: CompletionContext) => {
      const word = ctx.matchBefore(/@[\w.-]*/)
      if (!word || (word.from === word.to && !ctx.explicit)) return null
      const q = word.text.slice(1).toLowerCase()
      const options = usersRef.current
        .filter((u) => u.toLowerCase().startsWith(q))
        .slice(0, 6)
        .map((u) => ({ label: '@' + u, apply: '@' + u + ' ' }))
      return options.length ? { from: word.from, options } : null
    }

    const uploadFiles = async (files: FileList | File[]) => {
      const imgs = [...files].filter((f) => f.type.startsWith('image/'))
      for (const f of imgs) {
        const { url } = await uploadImage(f)
        const v = view.current
        if (!v) return
        const pos = v.state.selection.main.head
        const text = `![${f.name || 'image'}](${url})\n`
        v.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } })
      }
    }

    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          livePreview,
          markdown({ base: markdownLanguage, extensions: GFM }),
          EditorView.lineWrapping,
          history(),
          Prec.highest(
            keymap.of([
              {
                key: 'Enter',
                run: (v) => {
                  if (completionStatus(v.state) === 'active') return false
                  if (onSubmitRef.current) { onSubmitRef.current(); return true }
                  return false
                },
              },
              { key: 'Shift-Enter', run: (v) => { v.dispatch(v.state.replaceSelection('\n')); return true } },
            ]),
          ),
          autocompletion({ override: [mentionSource], icons: false }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          cmPlaceholder(placeholder ?? ''),
          theme(minRows),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            paste: (e) => {
              if (e.clipboardData?.files.length) { uploadFiles(e.clipboardData.files); return true }
              return false
            },
            drop: (e) => {
              if (e.dataTransfer?.files.length) { e.preventDefault(); uploadFiles(e.dataTransfer.files); return true }
              return false
            },
            blur: () => { onBlurRef.current?.(); return false },
          }),
        ],
      }),
    })
    view.current = v
    if (autoFocus) v.focus()
    return () => { v.destroy(); view.current = null }
    // create once; external value changes handled by the effect below
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // reconcile external value changes (e.g. a task refetch) into the editor
  useEffect(() => {
    const v = view.current
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={host} className="cm-host" />
}
