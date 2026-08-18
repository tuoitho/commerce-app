import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAdminProducts,
  getAdminProductById,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
} from './products'
import * as client from './client'
import type { ProductDetail, ProductSummary, SaveProductRequest } from './types'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
  apiClientWithMeta: vi.fn(),
}))

describe('products API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAdminProducts', () => {
    it('calls /admin/products with default parameters when none provided', async () => {
      const mockResult = {
        data: [] as ProductSummary[],
        meta: {
          timestamp: '2026-08-16T08:00:00Z',
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        },
        message: '',
      }

      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await getAdminProducts()

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/products')
      expect(res).toEqual(mockResult)
    })

    it('formats query parameters properly when q, page, and limit are passed', async () => {
      const mockProducts: ProductSummary[] = [
        {
          id: 'prod-1',
          name: 'iPhone 15 Pro Max',
          model: 'A3106',
          brand: 'Apple',
          category: { id: 'cat-phones', name: 'Điện thoại' },
          minPriceVnd: '29990000',
          maxPriceVnd: '34990000',
          price: '29990000',
          currency: 'VND',
          primaryImageUrl: 'https://example.com/iphone.jpg',
          inStock: true,
        },
      ]

      const mockResult = {
        data: mockProducts,
        meta: {
          timestamp: '2026-08-16T08:00:00Z',
          pagination: {
            page: 2,
            limit: 5,
            total: 15,
            totalPages: 3,
            hasNext: true,
            hasPrev: true,
          },
        },
        message: '',
      }

      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await getAdminProducts({ q: 'iPhone', page: 2, limit: 5 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/products?q=iPhone&page=2&limit=5')
      expect(res).toEqual(mockResult)
    })

    it('trims search query and omits empty search param', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [],
        meta: { timestamp: '2026-08-16T08:00:00Z' },
        message: '',
      })

      await getAdminProducts({ q: '   ', page: 1 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/products?page=1')
    })
  })

  describe('getAdminProductById', () => {
    it('calls /admin/products/:id and returns ProductDetail', async () => {
      const mockDetail: ProductDetail = {
        id: 'prod-1',
        name: 'iPhone 15 Pro Max',
        model: 'A3106',
        brand: 'Apple',
        category: { id: 'cat-phones', name: 'Điện thoại' },
        minPriceVnd: '29990000',
        maxPriceVnd: '34990000',
        price: '29990000',
        currency: 'VND',
        primaryImageUrl: 'https://example.com/iphone.jpg',
        inStock: true,
        description: 'Flagship phone from Apple',
        imageUrls: ['https://example.com/iphone.jpg'],
        stockQuantity: 50,
        featured: true,
        createdAt: '2026-08-16T00:00:00Z',
        updatedAt: '2026-08-16T00:00:00Z',
      }

      vi.mocked(client.apiClient).mockResolvedValueOnce(mockDetail)

      const res = await getAdminProductById('prod-1')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/products/prod-1')
      expect(res).toEqual(mockDetail)
    })
  })

  describe('createAdminProduct', () => {
    it('sends POST /admin/products with SaveProductRequest payload', async () => {
      const payload: SaveProductRequest = {
        name: 'Xiaomi 14 Ultra',
        model: '24030PN60G',
        brand: 'Xiaomi',
        description: 'Chụp ảnh đỉnh cao',
        categoryId: 'cat-phones',
        price: '24990000',
        currency: 'VND',
        stockQuantity: 20,
        featured: true,
        imageUrls: ['https://example.com/xiaomi.jpg'],
      }

      const mockResponse: ProductDetail = {
        id: 'prod-xiaomi-14',
        name: payload.name,
        model: payload.model,
        brand: payload.brand,
        category: { id: payload.categoryId, name: 'Điện thoại' },
        minPriceVnd: payload.price,
        maxPriceVnd: payload.price,
        price: payload.price,
        currency: payload.currency,
        primaryImageUrl: payload.imageUrls[0],
        inStock: true,
        description: payload.description,
        imageUrls: payload.imageUrls,
        stockQuantity: payload.stockQuantity,
        featured: payload.featured,
        createdAt: '2026-08-16T00:00:00Z',
        updatedAt: '2026-08-16T00:00:00Z',
      }

      vi.mocked(client.apiClient).mockResolvedValueOnce(mockResponse)

      const res = await createAdminProduct(payload)

      expect(client.apiClient).toHaveBeenCalledWith('/admin/products', {
        method: 'POST',
        body: payload,
      })
      expect(res).toEqual(mockResponse)
    })

    it('sends POST /admin/products with option groups and variants payload', async () => {
      const payload: SaveProductRequest = {
        name: 'iPhone 15 Pro',
        model: 'A3101',
        brand: 'Apple',
        description: 'Titanium phone',
        categoryId: 'cat-phones',
        price: '28990000',
        currency: 'VND',
        stockQuantity: 25,
        featured: true,
        imageUrls: ['https://example.com/iphone15.jpg'],
        hasVariants: true,
        optionGroups: [
          {
            id: 'g-color',
            label: 'Màu sắc',
            position: 0,
            values: [{ id: 'v-black', label: 'Đen Titan', position: 0 }],
          },
        ],
        variants: [
          {
            id: 'var-1',
            optionValueIds: { 'g-color': 'v-black' },
            priceVND: '28990000',
            stockQuantity: 25,
            active: true,
          },
        ],
      }

      const mockResponse: ProductDetail = {
        id: 'prod-iphone-15',
        name: payload.name,
        model: payload.model,
        brand: payload.brand,
        category: { id: payload.categoryId, name: 'Điện thoại' },
        minPriceVnd: '28990000',
        maxPriceVnd: '28990000',
        price: '28990000',
        currency: 'VND',
        primaryImageUrl: payload.imageUrls[0],
        inStock: true,
        description: payload.description,
        imageUrls: payload.imageUrls,
        stockQuantity: 25,
        featured: true,
        active: true,
        optionGroups: [
          {
            id: 'g-color',
            label: 'Màu sắc',
            position: 0,
            values: [{ id: 'v-black', label: 'Đen Titan' }],
          },
        ],
        variants: [
          {
            id: 'var-1',
            optionValueIds: { 'g-color': 'v-black' },
            priceVnd: '28990000',
            stockQuantity: 25,
            active: true,
          },
        ],
        createdAt: '2026-08-16T00:00:00Z',
        updatedAt: '2026-08-16T00:00:00Z',
      }

      vi.mocked(client.apiClient).mockResolvedValueOnce(mockResponse)

      const res = await createAdminProduct(payload)

      expect(client.apiClient).toHaveBeenCalledWith('/admin/products', {
        method: 'POST',
        body: payload,
      })
      expect(res).toEqual(mockResponse)
    })
  })

  describe('updateAdminProduct', () => {
    it('sends PUT /admin/products/:id with SaveProductRequest payload', async () => {
      const payload: SaveProductRequest = {
        name: 'Xiaomi 14 Ultra Updated',
        model: '24030PN60G',
        brand: 'Xiaomi',
        description: 'Chụp ảnh Leica',
        categoryId: 'cat-phones',
        price: '23990000',
        currency: 'VND',
        stockQuantity: 15,
        featured: false,
        imageUrls: ['https://example.com/xiaomi-updated.jpg'],
      }

      const mockResponse: ProductDetail = {
        id: 'prod-xiaomi-14',
        name: payload.name,
        model: payload.model,
        brand: payload.brand,
        category: { id: payload.categoryId, name: 'Điện thoại' },
        minPriceVnd: payload.price,
        maxPriceVnd: payload.price,
        price: payload.price,
        currency: payload.currency,
        primaryImageUrl: payload.imageUrls[0],
        inStock: true,
        description: payload.description,
        imageUrls: payload.imageUrls,
        stockQuantity: payload.stockQuantity,
        featured: payload.featured,
        createdAt: '2026-08-16T00:00:00Z',
        updatedAt: '2026-08-16T00:00:00Z',
      }

      vi.mocked(client.apiClient).mockResolvedValueOnce(mockResponse)

      const res = await updateAdminProduct('prod-xiaomi-14', payload)

      expect(client.apiClient).toHaveBeenCalledWith('/admin/products/prod-xiaomi-14', {
        method: 'PUT',
        body: payload,
      })
      expect(res).toEqual(mockResponse)
    })
  })

  describe('deleteAdminProduct', () => {
    it('sends DELETE /admin/products/:id', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(undefined)

      await deleteAdminProduct('prod-123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/products/prod-123', {
        method: 'DELETE',
      })
    })
  })
})

