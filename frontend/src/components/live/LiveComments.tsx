import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SendHorizontal } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { LiveComment } from '@/api/live'

const MAX_COMMENT_LENGTH = 200

interface LiveCommentListProps {
  comments: LiveComment[]
  variant: 'overlay' | 'panel'
}

export function LiveCommentList({ comments, variant }: LiveCommentListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [comments.length])

  if (variant === 'overlay') {
    return (
      <div
        className="max-h-56 overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,transparent,black_28%)]"
        aria-live="polite"
      >
        <ul className="flex flex-col gap-1.5">
          {comments.map((comment) => (
            <li key={comment.id} className="w-fit max-w-full rounded-2xl bg-black/35 px-3 py-1.5 text-[13px] leading-snug text-white backdrop-blur-sm">
              <CommentAuthor comment={comment} onDark />
              <span className="break-words">{comment.content}</span>
            </li>
          ))}
        </ul>
        <div ref={endRef} />
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
      {comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">Chưa có bình luận. Hãy là người đầu tiên đặt câu hỏi!</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="text-sm leading-snug text-zinc-800">
              <CommentAuthor comment={comment} />
              <span className="break-words">{comment.content}</span>
            </li>
          ))}
        </ul>
      )}
      <div ref={endRef} />
    </div>
  )
}

function CommentAuthor({ comment, onDark = false }: { comment: LiveComment; onDark?: boolean }) {
  if (comment.authorRole === 'admin') {
    return <span className="mr-1.5 inline-flex rounded bg-teal-600 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Chủ shop</span>
  }
  return <span className={`mr-1.5 font-semibold ${onDark ? 'text-teal-200' : 'text-zinc-500'}`}>{comment.authorName}</span>
}

interface LiveCommentComposerProps {
  onSubmit: (content: string) => Promise<void>
  variant: 'overlay' | 'panel'
}

export function LiveCommentComposer({ onSubmit, variant }: LiveCommentComposerProps) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      setContent('')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.fields?.content ?? err.message)
      } else {
        setError('Không gửi được bình luận, vui lòng thử lại')
      }
    } finally {
      setSending(false)
    }
  }

  const overlay = variant === 'overlay'
  return (
    <form onSubmit={submit} className={overlay ? 'flex flex-col gap-1' : 'flex flex-col gap-1 border-t border-zinc-200 px-4 py-3'}>
      {error && <p role="alert" className={`text-xs font-medium ${overlay ? 'text-rose-200' : 'text-rose-600'}`}>{error}</p>}
      <div className={`flex items-center gap-2 rounded-full pl-4 pr-1.5 ${overlay ? 'bg-black/40 backdrop-blur-sm' : 'border border-zinc-200 bg-white'}`}>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="Hỏi chủ shop…"
          aria-label="Bình luận"
          className={`h-10 min-w-0 flex-1 bg-transparent text-sm outline-none ${overlay ? 'text-white placeholder:text-zinc-300' : 'text-zinc-900 placeholder:text-zinc-400'}`}
        />
        <button
          type="submit"
          disabled={!content.trim() || sending}
          aria-label="Gửi bình luận"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white transition-opacity disabled:opacity-40"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </form>
  )
}
