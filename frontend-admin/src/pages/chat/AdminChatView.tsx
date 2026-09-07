import React, { useState, useRef, useLayoutEffect } from 'react'
import {
  User as UserIcon,
  Paperclip,
  Send,
  X,
  ArrowDown,
  Loader2,
  MessageCircle,
} from 'lucide-react'
import type { ChatConversation, ChatMessage } from '@/api/chat'
import { Button } from '@/components/ui/button'
import { OrderMessageCard } from './OrderMessageCard'

export interface AdminChatViewProps {
  conversation: ChatConversation
  messages: ChatMessage[]
  hasMore?: boolean
  isLoadingMessages?: boolean
  isLoadingOlder?: boolean
  onLoadOlder?: () => Promise<void> | void
  onSendMessage: (content: string, files?: File[], orderId?: string) => Promise<void>
  isSending?: boolean
}

export function AdminChatView({
  conversation,
  messages,
  hasMore = false,
  isLoadingMessages = false,
  isLoadingOlder = false,
  onLoadOlder,
  onSendMessage,
  isSending = false,
}: AdminChatViewProps) {
  const [inputContent, setInputContent] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<{ name: string; url: string; isVideo: boolean }[]>([])
  const [newMessagesCount, setNewMessagesCount] = useState(0)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isNearBottomRef = useRef(true)
  const prevMessagesRef = useRef<ChatMessage[]>([])
  const scrollBeforeLoadRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const nearBottom = distanceFromBottom <= 100
    isNearBottomRef.current = nearBottom

    if (nearBottom && newMessagesCount > 0) {
      setNewMessagesCount(0)
    }

    if (scrollTop <= 30 && hasMore && !isLoadingOlder && onLoadOlder) {
      scrollBeforeLoadRef.current = {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
      }
      onLoadOlder()
    }
  }

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const prevMessages = prevMessagesRef.current
    prevMessagesRef.current = messages

    if (prevMessages.length === 0) {
      container.scrollTop = container.scrollHeight
      isNearBottomRef.current = true
      return
    }

    const wasPrepended =
      messages.length > prevMessages.length &&
      messages[messages.length - 1]?.id === prevMessages[prevMessages.length - 1]?.id

    if (wasPrepended && scrollBeforeLoadRef.current) {
      const { scrollHeight: oldScrollHeight, scrollTop: oldScrollTop } = scrollBeforeLoadRef.current
      const newScrollHeight = container.scrollHeight
      const heightDiff = newScrollHeight - oldScrollHeight
      container.scrollTop = oldScrollTop + heightDiff
      scrollBeforeLoadRef.current = null
      return
    }

    const wasAppended =
      messages.length > prevMessages.length &&
      messages[0]?.id === prevMessages[0]?.id

    if (wasAppended) {
      if (isNearBottomRef.current) {
        container.scrollTo?.({ top: container.scrollHeight, behavior: 'smooth' })
        container.scrollTop = container.scrollHeight
        setNewMessagesCount(0)
      } else {
        const addedCount = messages.length - prevMessages.length
        setNewMessagesCount((prev) => prev + addedCount)
      }
    }
  }, [messages])

  const scrollToBottom = () => {
    const container = containerRef.current
    if (container) {
      container.scrollTo?.({ top: container.scrollHeight, behavior: 'smooth' })
      container.scrollTop = container.scrollHeight
    }
    setNewMessagesCount(0)
    isNearBottomRef.current = true
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const newFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) newFiles.push(file)
      }
    }

    if (newFiles.length > 0) {
      e.preventDefault()
      addFiles(newFiles)
    }
  }

  const addFiles = (files: File[]) => {
    const combined = [...selectedFiles, ...files].slice(0, 5)
    setSelectedFiles(combined)
    setFilePreviews(
      combined.map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
        isVideo: f.type.startsWith('video'),
      }))
    )
  }

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index)
    setSelectedFiles(updated)
    setFilePreviews(
      updated.map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
        isVideo: f.type.startsWith('video'),
      }))
    )
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputContent.trim() && selectedFiles.length === 0) return

    const content = inputContent
    const files = selectedFiles

    setInputContent('')
    setSelectedFiles([])
    setFilePreviews([])

    await onSendMessage(content, files)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  const isOnline = conversation.customerPresence?.status === 'online'
  const customerDisplayName =
    conversation.customerName || `Khách: ${conversation.userId ? conversation.userId.slice(0, 8) : ''}`

  return (
    <div
      data-testid="admin-chat-view"
      className="flex-1 flex flex-col bg-white overflow-hidden relative h-full"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700">
              <UserIcon className="h-5 w-5" />
            </div>
            <span
              data-testid="admin-view-presence-dot"
              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${
                isOnline ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-tight">
              {customerDisplayName}
            </h3>
            <p className="text-xs text-slate-500">
              {conversation.customerPresence?.displayText || (isOnline ? 'Đang hoạt động' : 'Không trực tuyến')}
            </p>
          </div>
        </div>
      </div>

      {/* Messages Scroll Container */}
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          data-testid="admin-messages-container"
          className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/40"
        >
          {isLoadingOlder && (
            <div
              data-testid="admin-loading-older-indicator"
              className="flex items-center justify-center py-2 text-xs text-slate-500 gap-1.5"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
              <span>Đang tải tin nhắn cũ...</span>
            </div>
          )}

          {isLoadingMessages ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              Đang tải tin nhắn...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-xs text-slate-400">
              <MessageCircle className="h-10 w-10 text-slate-300 mb-2" />
              <p className="font-medium text-slate-600">Chưa có tin nhắn trong cuộc hội thoại này</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAdmin = msg.senderRole === 'admin'
              return (
                <div
                  key={msg.id}
                  data-testid={`admin-message-${msg.id}`}
                  className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                >
                  <div className="text-[10px] font-medium text-slate-400 mb-1 px-1">
                    {isAdmin ? 'Quản trị viên (Bạn)' : customerDisplayName}
                  </div>

                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-xs shadow-sm ${
                      isAdmin
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                    }`}
                  >
                    {/* Order message attachment card */}
                    {msg.messageType === 'order' && msg.orderSummary && (
                      <div className="mb-2">
                        <OrderMessageCard
                          orderSummary={msg.orderSummary}
                          linkPrefix="/admin/orders/"
                        />
                      </div>
                    )}

                    {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

                    {/* Media attachments */}
                    {msg.media && msg.media.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {msg.media.map((m) => (
                          <div key={m.id} className="overflow-hidden rounded-lg border border-black/10">
                            {m.mediaType === 'image' ? (
                              <img
                                src={m.url}
                                alt={m.fileName}
                                className="max-h-56 w-full object-cover cursor-pointer hover:opacity-95"
                                onClick={() => window.open(m.url, '_blank')}
                              />
                            ) : (
                              <video
                                src={m.url}
                                controls
                                preload="metadata"
                                className="max-h-56 w-full rounded-lg"
                              >
                                Trình duyệt không hỗ trợ phát video.
                              </video>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="mt-1 text-[10px] text-slate-400 px-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Floating Jump-to-Bottom Button */}
        {newMessagesCount > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Tin nhắn mới, cuộn xuống dưới cùng"
            data-testid="admin-jump-to-bottom-button"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg transition-all hover:bg-blue-700 hover:scale-105 animate-bounce z-10"
          >
            <span>Có {newMessagesCount} tin mới</span>
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* File Previews Strip */}
      {filePreviews.length > 0 && (
        <div className="flex gap-2 border-t border-slate-200 bg-white px-6 py-2 overflow-x-auto">
          {filePreviews.map((p, idx) => (
            <div key={idx} className="relative h-14 w-14 flex-shrink-0 rounded-lg border border-slate-200 overflow-hidden group">
              {p.isVideo ? (
                <div className="flex h-full w-full items-center justify-center bg-slate-800 text-[9px] text-white">
                  Video
                </div>
              ) : (
                <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeFile(idx)}
                className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Reply Input Form */}
      <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-white">
        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            multiple
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl p-2.5 text-slate-500 hover:text-slate-800"
            title="Đính kèm ảnh/video (tối đa 5 tệp)"
            aria-label="Đính kèm tệp"
          >
            <Paperclip className="h-5 w-5" />
          </Button>

          <textarea
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Nhập phản hồi của quản trị viên... (hoặc dán Ctrl+V ảnh)"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <Button
            type="submit"
            disabled={isSending || (!inputContent.trim() && selectedFiles.length === 0)}
            className="h-10 px-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            aria-label="Gửi phản hồi"
          >
            <Send className="h-4 w-4 mr-1.5" />
            <span>Gửi</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
