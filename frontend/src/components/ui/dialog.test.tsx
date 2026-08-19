import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './dialog'

describe('Dialog UI Primitive', () => {
  it('does not render content when open is false', () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Modal Title</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    expect(screen.queryByText('Modal Title')).not.toBeInTheDocument()
  })

  it('renders content when open is true', () => {
    const onOpenChange = vi.fn()

    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tiêu đề hộp thoại</DialogTitle>
            <DialogDescription>Mô tả chi tiết nội dung hộp thoại</DialogDescription>
          </DialogHeader>
          <div>Nội dung chính</div>
          <DialogFooter>
            <DialogClose>Đóng</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Tiêu đề hộp thoại')).toBeInTheDocument()
    expect(screen.getByText('Mô tả chi tiết nội dung hộp thoại')).toBeInTheDocument()
    expect(screen.getByText('Nội dung chính')).toBeInTheDocument()

    const closeBtn = screen.getByRole('button', { name: 'Đóng' })
    fireEvent.click(closeBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('DialogTrigger opens dialog on click', () => {
    const onOpenChange = vi.fn()

    render(
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogTrigger>Mở hộp thoại</DialogTrigger>
        <DialogContent>
          <DialogTitle>Nội dung</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    const triggerBtn = screen.getByRole('button', { name: 'Mở hộp thoại' })
    fireEvent.click(triggerBtn)
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('closes on close icon button click', () => {
    const onOpenChange = vi.fn()

    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Tiêu đề</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    const closeIconBtn = screen.getByLabelText('Close')
    fireEvent.click(closeIconBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Escape key press', () => {
    const onOpenChange = vi.fn()

    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Tiêu đề</DialogTitle>
        </DialogContent>
      </Dialog>
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
