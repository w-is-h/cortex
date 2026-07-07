import { syntaxTree } from '@codemirror/language'
import { type Range, RangeSetBuilder } from '@codemirror/state'
import {
  Decoration, type DecorationSet, EditorView, type PluginValue, ViewPlugin,
  type ViewUpdate, WidgetType,
} from '@codemirror/view'
import { openLightbox } from '../../lib/lightbox'

/** Obsidian-style live preview: markdown renders inline; the raw syntax of an
 *  element is only shown while the cursor is on its line. Built as CodeMirror
 *  decorations over the Lezer markdown tree. */

class CheckboxWidget extends WidgetType {
  checked: boolean
  from: number
  to: number
  constructor(checked: boolean, from: number, to: number) {
    super()
    this.checked = checked
    this.from = from
    this.to = to
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-task-checkbox'
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', (e) => {
      e.preventDefault()
      view.dispatch({ changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' } })
    })
    return box
  }
  ignoreEvent() {
    return false
  }
}

class BulletWidget extends WidgetType {
  eq() { return true }
  toDOM() {
    const b = document.createElement('span')
    b.className = 'cm-bullet'
    b.textContent = '•'
    return b
  }
}

class ImageWidget extends WidgetType {
  url: string
  alt: string
  constructor(url: string, alt: string) { super(); this.url = url; this.alt = alt }
  eq(other: ImageWidget) { return other.url === this.url && other.alt === this.alt }
  toDOM() {
    const img = document.createElement('img')
    img.src = this.url
    img.alt = this.alt
    img.className = 'cm-img'
    img.addEventListener('mousedown', (e) => e.preventDefault())
    img.addEventListener('click', (e) => { e.preventDefault(); openLightbox(this.url) })
    return img
  }
  ignoreEvent() { return false }
}

const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)/

const HEADING = /^ATXHeading(\d)$/

function build(view: EditorView): DecorationSet {
  const { state } = view
  const decos: Range<Decoration>[] = []

  // lines that hold a cursor/selection — their raw syntax stays visible
  const active = new Set<number>()
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number
    const b = state.doc.lineAt(r.to).number
    for (let n = a; n <= b; n++) active.add(n)
  }
  const lineActive = (pos: number) => active.has(state.doc.lineAt(pos).number)
  const hide = (from: number, to: number) => {
    if (from < to) decos.push(Decoration.replace({}).range(from, to))
  }
  const mark = (from: number, to: number, cls: string) => {
    if (from < to) decos.push(Decoration.mark({ class: cls }).range(from, to))
  }
  const line = (pos: number, cls: string) => {
    decos.push(Decoration.line({ class: cls }).range(state.doc.lineAt(pos).from))
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name
        const hm = HEADING.exec(name)
        if (hm) {
          line(node.from, `cm-heading cm-h${hm[1]}`)
          return
        }
        if (name === 'Image') {
          if (!lineActive(node.from)) {
            const m = IMAGE_RE.exec(state.doc.sliceString(node.from, node.to))
            if (m) decos.push(Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }).range(node.from, node.to))
          }
          return false // don't hide the inner ![]() marks separately
        }
        switch (name) {
          case 'HeaderMark': {
            if (!lineActive(node.from)) {
              // also swallow the space after the #'s
              let end = node.to
              if (state.doc.sliceString(end, end + 1) === ' ') end += 1
              hide(node.from, end)
            }
            break
          }
          case 'StrongEmphasis':
            mark(node.from, node.to, 'cm-strong')
            break
          case 'Emphasis':
            mark(node.from, node.to, 'cm-em')
            break
          case 'Strikethrough':
            mark(node.from, node.to, 'cm-strike')
            break
          case 'InlineCode':
            mark(node.from, node.to, 'cm-inline-code')
            break
          case 'EmphasisMark':
          case 'StrikethroughMark':
          case 'CodeMark':
          case 'QuoteMark':
          case 'LinkMark':
            if (!lineActive(node.from)) hide(node.from, node.to)
            break
          case 'URL':
            if (!lineActive(node.from)) hide(node.from, node.to)
            break
          case 'Link':
            mark(node.from, node.to, 'cm-link')
            break
          case 'Blockquote':
            for (let l = state.doc.lineAt(node.from).number; l <= state.doc.lineAt(node.to).number; l++) {
              const ln = state.doc.line(l)
              decos.push(Decoration.line({ class: 'cm-blockquote' }).range(ln.from))
            }
            break
          case 'FencedCode':
            for (let l = state.doc.lineAt(node.from).number; l <= state.doc.lineAt(node.to).number; l++) {
              const ln = state.doc.line(l)
              decos.push(Decoration.line({ class: 'cm-codeblock' }).range(ln.from))
            }
            break
          case 'ListMark': {
            const txt = state.doc.sliceString(node.from, node.to)
            const isTask = /^\s*\[[ xX]\]/.test(state.doc.sliceString(node.to, node.to + 5))
            if (/[-*+]/.test(txt) && !isTask && !lineActive(node.from)) {
              decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
            }
            break
          }
          case 'TaskMarker': {
            if (!lineActive(node.from)) {
              const checked = /[xX]/.test(state.doc.sliceString(node.from, node.to))
              decos.push(
                Decoration.replace({ widget: new CheckboxWidget(checked, node.from, node.to) })
                  .range(node.from, node.to),
              )
            }
            break
          }
        }
      },
    })
  }

  // Decoration.set sorts for us (mixing line/mark/replace at varied positions)
  const builder = new RangeSetBuilder<Decoration>()
  decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
  for (const d of decos) builder.add(d.from, d.to, d.value)
  return builder.finish()
}

export const livePreview = ViewPlugin.fromClass(
  class implements PluginValue {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = build(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
