import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EyeOff, SendHorizontal } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { LiveComment } from '@/api/live'

interface LiveCommentsPanelProps {
  comments: LiveComment[]
  onSend: (content: string) => Promise<void>
  onHide: (commentId: string) => Promise<void>
}

export function LiveCommentsPanel({ comments, onSend, onHide }: LiveCommentsPanelProps) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [comments.length])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      await onSend(trimmed)
      setContent('')
    } catch (err) {
      setError(err instanceof ApiError ? err.fields?.content ?? err.message : 'Không gửi được bình luận')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white">
      <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">Bình luận</h2>
      <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
        {comments.length === 0 && <li className="py-6 text-center text-sm text-zinc-500">Chưa có bình luận</li>}
        {comments.map((comment) => (
          <li key={comment.id} data-testid={`admin-comment-${comment.id}`} className={`group flex items-start gap-2 text-sm ${comment.hidden ? 'opacity-50' : ''}`}>
            <div className="min-w-0 flex-1 leading-snug">
              {comment.authorRole === 'admin' ? (
                <span className="mr-1.5 rounded bg-teal-600 px-1.5 py-0.5 text-[11px] font-bold uppercase text-white">Chủ shop</span>
              ) : (
                <span className="mr-1.5 font-semibold text-zinc-500">{comment.authorName}</span>
              )}
              <span className="break-words text-zinc-900">{comment.content}</span>
              {comment.hidden && <span className="ml-1.5 text-xs text-zinc-400">(đã ẩn)</span>}
            </div>
            {!comment.hidden && comment.authorRole !== 'admin' && (
              <button
                type="button"
                onClick={() => void onHide(comment.id)}
                aria-label={`Ẩn bình luận của ${comment.authorName}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-rose-600"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
        <div ref={endRef} />
      </ul>
      <form onSubmit={submit} className="border-t border-zinc-100 px-4 py-3">
        {error && <p role="alert" className="mb-1.5 text-xs text-rose-600">{error}</p>}
        <div className="flex items-center gap-2">
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={200}
            placeholder="Trả lời với tư cách Chủ shop…"
            aria-label="Bình luận của chủ shop"
            className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-teal-600"
          />
          <button type="submit" disabled={!content.trim() || sending} aria-label="Gửi bình luận" className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white disabled:opacity-40">
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  )
}
