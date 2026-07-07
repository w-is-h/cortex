import { lazy, Suspense } from 'react'
import type { CodeEditorProps } from './cm/CodeEditor'

const CodeEditor = lazy(() => import('./cm/CodeEditor'))

/** Obsidian-style live-preview markdown editor (CodeMirror, lazy-loaded).
 *  `bare` drops the bordered container — used for the always-editable task/project
 *  description; the default framed form is used for the comment composer. */
export function MarkdownEditor({ bare, ...props }: CodeEditorProps & { bare?: boolean }) {
  const editor = (
    <Suspense fallback={<div style={{ minHeight: `${(props.minRows ?? 4) * 1.6}em` }} />}>
      <CodeEditor {...props} />
    </Suspense>
  )
  if (bare) return editor
  return (
    <div className="relative border border-line-strong rounded-lg bg-panel overflow-hidden focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
      {editor}
      {props.onSubmit && (
        <div className="px-2.5 py-1 text-[11px] text-ink-faint text-right border-t border-line select-none">
          ↵ send · ⇧↵ newline · @mention
        </div>
      )}
    </div>
  )
}
