import { useState, useRef } from 'react'
import {
  MessageCircle,
  X,
  Send,
  Paperclip,
  ShoppingBag,
} from 'lucide-react'
import { useChat } from '@/context/ChatContext'
import { useAuth } from '@/context/AuthContext'
import { ChatMessageList } from './ChatMessageList'
import { OrderSelectorModal } from './OrderSelectorModal'

export function ChatWidget() {
  const { user } = useAuth()
  const {
    isOpen,
    activeConversation,
    messages,
    hasMore,
    isLoadingOlder,
    loadOlderMessages,
    totalUnread,
    isSending,
    openChat,
    closeChat,
    sendChatMessage,
  } = useChat()

  const [inputContent, setInputContent] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<{ name: string; url: string; isVideo: boolean }[]>([])
  const [showOrderSelector, setShowOrderSelector] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Clipboard paste (Ctrl+V) handler for images
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const newFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          newFiles.push(file)
        }
      }
    }

    if (newFiles.length > 0) {
      e.preventDefault()
      addFiles(newFiles)
    }
  }

  const addFiles = (files: File[]) => {
    const combined = [...selectedFiles, ...files].slice(0, 5) // max 5 files
    setSelectedFiles(combined)

    const previews = combined.map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      isVideo: f.type.startsWith('video'),
    }))
    setFilePreviews(previews)
  }

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index)
    setSelectedFiles(updated)
    const previews = updated.map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      isVideo: f.type.startsWith('video'),
    }))
    setFilePreviews(previews)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      addFiles(files)
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputContent.trim() && selectedFiles.length === 0) return

    const content = inputContent
    const files = selectedFiles

    setInputContent('')
    setSelectedFiles([])
    setFilePreviews([])

    await sendChatMessage(content, files)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  const handleSelectOrderToAttach = async (orderId: string) => {
    await sendChatMessage('Tôi muốn hỏi về đơn hàng này', undefined, orderId)
  }

  if (!user) {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Chat Bubble Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => openChat()}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl transition-all duration-300 hover:scale-105 hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-300"
          aria-label="Mở hộp thoại hỗ trợ trực tuyến"
        >
          <MessageCircle className="h-7 w-7 transition-transform group-hover:rotate-6" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white shadow ring-2 ring-white animate-pulse">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Expandable Chat Dialog Window */}
      {isOpen && (
        <div className="relative flex h-[560px] w-[380px] sm:w-[420px] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 font-semibold text-white">
                  CS
                </div>
                {activeConversation?.adminPresence && (
                  <span
                    data-testid="admin-presence-indicator"
                    className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-slate-900 ${
                      activeConversation.adminPresence.status === 'online'
                        ? 'bg-emerald-400'
                        : 'bg-slate-400'
                    }`}
                  />
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-tight">Hỗ trợ khách hàng</h3>
                <p className="text-xs text-slate-300">
                  {activeConversation?.adminPresence?.displayText || 'Đang sẵn sàng hỗ trợ'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={closeChat}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Đóng hộp thoại"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Reverse Scroll Message List with Jump Indicator */}
          <ChatMessageList
            messages={messages}
            hasMore={hasMore}
            isLoadingOlder={isLoadingOlder}
            onLoadOlder={loadOlderMessages}
            currentUserId={user?.id}
            linkPrefix="/orders/"
          />

          {/* File Previews */}
          {filePreviews.length > 0 && (
            <div className="flex gap-2 border-t border-slate-100 bg-white p-2 overflow-x-auto">
              {filePreviews.map((p, idx) => (
                <div
                  key={idx}
                  className="relative h-14 w-14 flex-shrink-0 rounded-lg border border-slate-200 overflow-hidden group"
                >
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

          {/* Message Input Form */}
          <form onSubmit={handleSend} className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-end gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                multiple
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                title="Đính kèm ảnh/video (tối đa 5 tệp)"
                aria-label="Đính kèm tệp"
              >
                <Paperclip className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={() => setShowOrderSelector(true)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                title="Đính kèm đơn hàng"
                aria-label="Đính kèm đơn hàng"
              >
                <ShoppingBag className="h-5 w-5" />
              </button>

              <textarea
                value={inputContent}
                onChange={(e) => setInputContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Nhập tin nhắn... (hoặc dán Ctrl+V ảnh)"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />

              <button
                type="submit"
                disabled={isSending || (!inputContent.trim() && selectedFiles.length === 0)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Gửi tin nhắn"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* Order Selector Modal Overlay */}
          <OrderSelectorModal
            isOpen={showOrderSelector}
            onClose={() => setShowOrderSelector(false)}
            onSelectOrder={handleSelectOrderToAttach}
          />
        </div>
      )}
    </div>
  )
}
