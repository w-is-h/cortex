import { Paperclip } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { useUsers } from '../api/hooks'
import { openLightbox } from '../lib/lightbox'

/* eslint-disable @typescript-eslint/no-explicit-any */

// chars a bare @token may contain; a username match must not be followed by
// one, so '@ann' doesn't fire inside '@annika'
const TOKEN = 'A-Za-z0-9_.-'
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Wrap @mentions in <span class="mention"> (skipping code/links). Known
 *  usernames match in full — they may contain spaces — longest first;
 *  anything else falls back to a single @token. */
function rehypeMentions(usernames: string[] = []) {
  const names = [...usernames]
    .sort((a, b) => b.length - a.length)
    .map((n) => `${escapeRe(n)}(?![${TOKEN}])`)
  const re = new RegExp(`@(?:${[...names, `[${TOKEN}]+`].join('|')})`, 'gi')
  return (tree: any) => {
    visit(tree, 'text', (node: any, index: number | undefined, parent: any) => {
      if (index === undefined || !parent?.tagName) return
      if (['code', 'pre', 'a'].includes(parent.tagName)) return
      const value: string = node.value
      re.lastIndex = 0
      if (!re.test(value)) return
      re.lastIndex = 0
      const parts: any[] = []
      let last = 0
      for (const m of value.matchAll(re)) {
        if (m.index! > last) parts.push({ type: 'text', value: value.slice(last, m.index) })
        parts.push({
          type: 'element',
          tagName: 'span',
          properties: { className: ['mention'] },
          children: [{ type: 'text', value: m[0] }],
        })
        last = m.index! + m[0].length
      }
      if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
      parent.children.splice(index, 1, ...parts)
      return index + parts.length
    })
  }
}

/** Number the task-list checkboxes in document order so toggles map to source. */
function rehypeCheckboxIndex() {
  return (tree: any) => {
    let i = 0
    visit(tree, 'element', (node: any) => {
      if (node.tagName === 'input' && node.properties?.type === 'checkbox') {
        node.properties.dataIndex = i++
      }
    })
  }
}

const CHECKBOX_RE = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\]/gm

/** Flip the nth task-list checkbox in a markdown source string. */
export function toggleCheckbox(md: string, index: number, checked: boolean): string {
  let i = 0
  return md.replace(CHECKBOX_RE, (match, prefix) =>
    i++ === index ? `${prefix}[${checked ? 'x' : ' '}]` : match,
  )
}

export function Markdown({
  children, onToggleCheckbox,
}: {
  children: string
  /** When set, task-list checkboxes are clickable in view mode. */
  onToggleCheckbox?: (index: number, checked: boolean) => void
}) {
  const users = useUsers()
  if (!children.trim()) return null
  const usernames = (users.data ?? []).map((u) => u.username)
  return (
    <div className="prose-cortex">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeMentions, usernames], rehypeCheckboxIndex]}
        components={{
          a: (props) => {
            const { node, href, children, ...rest } = props as any
            // uploaded files get a paperclip and download directly
            if (typeof href === 'string' && href.startsWith('/api/images/')) {
              return (
                <a href={href} download {...rest} onClick={(e) => e.stopPropagation()}>
                  <Paperclip className="inline size-3.5 mr-1 align-[-2px]" />
                  {children}
                </a>
              )
            }
            return <a href={href} {...rest}>{children}</a>
          },
          img: (props) => {
            const { node, src, ...rest } = props as any
            return (
              <img
                {...rest}
                src={src}
                onClick={(e) => { e.stopPropagation(); if (src) openLightbox(src) }}
                className="cursor-zoom-in"
              />
            )
          },
          input: (props) => {
            const { type, checked, node, ...rest } = props as any
            if (type !== 'checkbox') return <input type={type} {...rest} />
            const index = Number(node?.properties?.dataIndex ?? -1)
            return (
              <input
                type="checkbox"
                checked={!!checked}
                disabled={!onToggleCheckbox}
                onChange={(e) => onToggleCheckbox?.(index, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="accent-[var(--color-brand)] cursor-pointer -ml-5 mr-1.5 align-middle"
              />
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
