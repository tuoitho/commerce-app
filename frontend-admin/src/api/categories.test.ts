import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCategory, deleteCategory, getAdminCategories, getCategories, updateCategory } from './categories'
import * as client from './client'
import type { Category } from './types'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
}))

describe('categories API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCategories', () => {
    it('calls /categories and returns Category list', async () => {
      const mockCategories: Category[] = [
        { id: 'cat-1', name: 'Điện thoại' },
        { id: 'cat-2', name: 'Máy tính bảng' },
      ]

      vi.mocked(client.apiClient).mockResolvedValueOnce(mockCategories)

      const result = await getCategories()

      expect(client.apiClient).toHaveBeenCalledWith('/categories')
      expect(result).toEqual(mockCategories)
    })
  })

  it('calls admin category CRUD endpoints with payloads', async () => {
    const category = { id: 'cat-1', name: 'Điện thoại' }
    vi.mocked(client.apiClient).mockResolvedValue(category)
    await getAdminCategories()
    await createCategory({ name: 'Điện thoại' })
    await updateCategory('cat-1', { name: 'Máy tính bảng' })
    await deleteCategory('cat-1')
    expect(client.apiClient).toHaveBeenNthCalledWith(1, '/admin/categories')
    expect(client.apiClient).toHaveBeenNthCalledWith(2, '/admin/categories', { method: 'POST', body: { name: 'Điện thoại' } })
    expect(client.apiClient).toHaveBeenNthCalledWith(3, '/admin/categories/cat-1', { method: 'PUT', body: { name: 'Máy tính bảng' } })
    expect(client.apiClient).toHaveBeenNthCalledWith(4, '/admin/categories/cat-1', { method: 'DELETE' })
  })
})
