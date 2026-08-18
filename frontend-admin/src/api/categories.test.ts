import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getCategories } from './categories'
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
})
