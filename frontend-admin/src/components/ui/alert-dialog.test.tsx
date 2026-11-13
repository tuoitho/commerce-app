import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './alert-dialog'

describe('AlertDialog', () => {
  it('does not render content when open is false', () => {
    render(
      <AlertDialog open={false}>
        <AlertDialogContent>
          <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    )

    expect(screen.queryByText('Xác nhận xóa')).not.toBeInTheDocument()
  })

  it('renders title, description, and action buttons when open is true', () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()

    render(
      <AlertDialog open={true} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa sản phẩm</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa sản phẩm này không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Xác nhận xóa sản phẩm')).toBeInTheDocument()
    expect(
      screen.getByText('Bạn có chắc chắn muốn xóa sản phẩm này không?')
    ).toBeInTheDocument()

    const cancelBtn = screen.getByRole('button', { name: 'Hủy' })
    fireEvent.click(cancelBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)

    const confirmBtn = screen.getByRole('button', { name: 'Xóa' })
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalled()
  })

  it('closes dialog on Escape key press', () => {
    const onOpenChange = vi.fn()

    render(
      <AlertDialog open={true} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogTitle>Tiêu đề</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  function FocusHarness({ withAutoFocus = false }: { withAutoFocus?: boolean }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Mở hộp thoại
        </button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogTitle>Tiêu đề</AlertDialogTitle>
            {withAutoFocus && <input aria-label="Ô nhập" autoFocus />}
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  it('moves focus into the dialog on open and back to the trigger on close', () => {
    render(<FocusHarness />)
    const trigger = screen.getByRole('button', { name: 'Mở hộp thoại' })
    trigger.focus()
    fireEvent.click(trigger)

    expect(screen.getByRole('alertdialog').contains(document.activeElement)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps focus on an autoFocus element inside the dialog', () => {
    render(<FocusHarness withAutoFocus />)
    const trigger = screen.getByRole('button', { name: 'Mở hộp thoại' })
    trigger.focus()
    fireEvent.click(trigger)

    expect(document.activeElement).toBe(screen.getByLabelText('Ô nhập'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })
})
