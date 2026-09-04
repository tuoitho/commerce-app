import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AdminReplyComposer } from './AdminReplyComposer'
import * as chatApi from '@/api/chat'

describe('AdminReplyComposer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  it('renders textarea, attach button, and disabled send button when empty', () => {
    render(<AdminReplyComposer conversationId="conv-1" onSendMessage={vi.fn()} />)

    expect(screen.getByTestId('admin-chat-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('admin-attach-file-btn')).toBeInTheDocument()
    expect(screen.getByTestId('admin-send-message-btn')).toBeDisabled()
  })

  it('enables send button when text is entered and sends message on click', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    render(<AdminReplyComposer conversationId="conv-1" onSendMessage={onSendMessage} />)

    const textarea = screen.getByTestId('admin-chat-textarea')
    fireEvent.change(textarea, { target: { value: 'Xin chào khách hàng' } })

    const sendBtn = screen.getByTestId('admin-send-message-btn')
    expect(sendBtn).not.toBeDisabled()

    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith({
        content: 'Xin chào khách hàng',
        attachmentIds: undefined,
      })
    })

    // Cleared after send
    expect(textarea).toHaveValue('')
  })

  it('sends message when pressing Enter without Shift', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    render(<AdminReplyComposer conversationId="conv-1" onSendMessage={onSendMessage} />)

    const textarea = screen.getByTestId('admin-chat-textarea')
    fireEvent.change(textarea, { target: { value: 'Phản hồi nhanh' } })

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith({
        content: 'Phản hồi nhanh',
        attachmentIds: undefined,
      })
    })
  })

  it('does not send message on Shift+Enter', () => {
    const onSendMessage = vi.fn()
    render(<AdminReplyComposer conversationId="conv-1" onSendMessage={onSendMessage} />)

    const textarea = screen.getByTestId('admin-chat-textarea')
    fireEvent.change(textarea, { target: { value: 'Xuống dòng' } })

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('handles media upload and includes attachmentIds when sending', async () => {
    const mockAttachment = {
      id: 'att-123',
      fileType: 'image' as const,
      fileUrl: '/api/v1/chat/media/att-123',
      fileName: 'test.png',
      fileSize: 1024,
      mimeType: 'image/png',
    }
    vi.spyOn(chatApi, 'uploadAdminMedia').mockResolvedValue(mockAttachment)
    const onSendMessage = vi.fn().mockResolvedValue(undefined)

    render(<AdminReplyComposer conversationId="conv-1" onSendMessage={onSendMessage} />)

    const fileInput = screen.getByTestId('admin-chat-file-input')
    const file = new File(['content'], 'test.png', { type: 'image/png' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByTestId('admin-pending-media-container')).toBeInTheDocument()
    })

    // Send button enabled even without text when attachment is ready
    const sendBtn = screen.getByTestId('admin-send-message-btn')
    await waitFor(() => {
      expect(sendBtn).not.toBeDisabled()
    })

    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith({
        content: undefined,
        attachmentIds: ['att-123'],
      })
    })
  })

  it('shows error indicator for invalid file types', async () => {
    render(<AdminReplyComposer conversationId="conv-1" onSendMessage={vi.fn()} />)

    const fileInput = screen.getByTestId('admin-chat-file-input')
    const invalidFile = new File(['dummy'], 'document.pdf', { type: 'application/pdf' })

    fireEvent.change(fileInput, { target: { files: [invalidFile] } })

    await waitFor(() => {
      expect(screen.getByTestId('admin-pending-media-container')).toBeInTheDocument()
    })

    // Cannot send unsupported file
    expect(screen.getByTestId('admin-send-message-btn')).toBeDisabled()
  })
})
