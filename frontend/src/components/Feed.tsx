import { Pencil, SmilePlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCommentMutations, useUsers } from '../api/hooks'
import type { Activity, Comment } from '../api/types'
import { Markdown } from './Markdown'
import { MarkdownEditor } from './MarkdownEditor'
import { useSpace } from './Shell'
import { Avatar, Button, timeAgo } from './ui'

const EMOJI = ['👍', '👎', '❤️', '🎉', '😄', '🚀', '👀']

/** Chronological feed of comments interleaved with activity, plus a composer. */
export function Feed({
  parentType, parentId, comments, activity = [],
}: {
  parentType: 'task' | 'project'
  parentId: number
  comments: Comment[]
  activity?: Activity[]
}) {
  const { me } = useSpace()
  const mutations = useCommentMutations(parentType, parentId)
  const [draft, setDraft] = useState('')

  const submit = async () => {
    if (!draft.trim() || mutations.create.isPending) return
    await mutations.create.mutateAsync(draft)
    setDraft('')
  }

  const entries = [
    ...comments.map((c) => ({ at: c.created_at, id: `c${c.id}`, comment: c, act: undefined as Activity | undefined })),
    ...activity.map((a) => ({ at: a.created_at, id: `a${a.id}`, comment: undefined as Comment | undefined, act: a })),
  ].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0))

  // keep the scroll pinned to the newest entry (bottom)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])

  return (
    <div className="flex flex-col min-h-0 h-full">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-wider text-ink-dim mb-3 shrink-0">
        Activity
      </h2>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {entries.map((entry) =>
          entry.comment ? (
            <CommentCard
              key={entry.id}
              comment={entry.comment}
              canDelete={me.is_admin || entry.comment.author_id === me.id}
              onDelete={() => mutations.remove.mutate(entry.comment!.id)}
              onEdit={(body) => mutations.edit.mutate({ commentId: entry.comment!.id, body })}
              onReact={(emoji, remove) =>
                mutations.react.mutate({ commentId: entry.comment!.id, emoji, remove })
              }
              myId={me.id}
            />
          ) : (
            <ActivityRow key={entry.id} act={entry.act!} />
          ),
        )}
      </div>

      <div className="mt-3 shrink-0">
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          minRows={2}
          placeholder="Leave a comment… (@mention to notify)"
          onSubmit={submit}
        />
        <div className="flex justify-end mt-2">
          <Button kind="primary" disabled={!draft.trim() || mutations.create.isPending} onClick={submit}>
            Comment
          </Button>
        </div>
      </div>
    </div>
  )
}

function CommentCard({
  comment, canDelete, onDelete, onEdit, onReact, myId,
}: {
  comment: Comment
  canDelete: boolean
  onDelete: () => void
  onEdit: (body: string) => void
  onReact: (emoji: string, remove: boolean) => void
  myId: number
}) {
  const [picker, setPicker] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const users = useUsers()
  const who = (ids: number[]) =>
    ids.map((id) => users.data?.find((u) => u.id === id)?.username ?? '…').join(', ')
  return (
    <div className="group border border-line rounded-lg bg-panel">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line">
        <Avatar name={comment.author_username} size={18} />
        <span className="text-sm font-medium">{comment.author_username}</span>
        <span className="text-xs text-ink-faint font-mono">{timeAgo(comment.created_at)}</span>
        <span className="flex-1" />
        <Popover open={picker} onOpenChange={setPicker}>
          <PopoverTrigger
            className="text-ink-faint hover:text-ink px-1 opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100 transition-opacity outline-none"
            title="React"
          >
            <SmilePlus className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent className="flex p-1 gap-0.5 w-fit" side="top">
            {EMOJI.map((e) => (
              <button
                key={e}
                className="hover:bg-raised rounded px-1 py-0.5"
                onClick={() => {
                  const mine = comment.reactions.find((r) => r.emoji === e)?.user_ids.includes(myId)
                  onReact(e, !!mine)
                  setPicker(false)
                }}
              >
                {e}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        {canDelete && (
          <button
            className="text-ink-faint hover:text-ink px-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => { setDraft(comment.body); setEditing(true) }}
            title="Edit comment"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            className="text-ink-faint hover:text-danger px-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onDelete}
            title="Delete comment"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="px-3 py-2">
        {editing ? (
          <>
            <MarkdownEditor value={draft} onChange={setDraft} autoFocus minRows={2} />
            <div className="flex justify-end gap-2 mt-2">
              <Button kind="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button kind="primary" disabled={!draft.trim()}
                      onClick={() => { onEdit(draft); setEditing(false) }}>Save</Button>
            </div>
          </>
        ) : (
          <Markdown>{comment.body}</Markdown>
        )}
      </div>
      {comment.reactions.length > 0 && (
        <div className="flex gap-1 px-3 pb-2 flex-wrap">
          {comment.reactions.map((r) => {
            const mine = r.user_ids.includes(myId)
            return (
              <button
                key={r.emoji}
                onClick={() => onReact(r.emoji, mine)}
                title={who(r.user_ids)}
                className={`text-xs rounded-full border px-1.5 py-px transition-colors ${
                  mine ? 'border-brand/50 bg-brand-soft' : 'border-line-strong bg-raised hover:border-ink-faint'
                }`}
              >
                {r.emoji} {r.count}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ACT_TEXT: Record<string, string> = {
  created: 'created this task',
  status_changed: 'moved this to',
  priority_changed: 'set priority to',
  assigned: 'changed the assignee',
  sprint_moved: 'moved this to another sprint',
  project_changed: 'changed the project',
  title_edited: 'edited the title',
  description_edited: 'edited the description',
  blocker_added: 'added a blocker',
  blocker_removed: 'removed a blocker',
}

function ActivityRow({ act }: { act: Activity }) {
  const to = act.detail?.to
  const showTo = act.type === 'status_changed' || act.type === 'priority_changed'
  return (
    <div className="flex items-center gap-2 text-xs text-ink-dim pl-1">
      <span className="size-1.5 rounded-full bg-line-strong shrink-0" />
      <span>
        <span className="font-medium text-ink">{act.actor_username}</span>{' '}
        {ACT_TEXT[act.type] ?? act.type}
        {showTo && <span className="font-medium text-ink"> {String(to).replace('_', ' ')}</span>}
      </span>
      <span className="text-ink-faint font-mono">{timeAgo(act.created_at)}</span>
    </div>
  )
}
