import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  addressesApi,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from './addresses'
import type { Address, AddressInput } from './types'

describe('addressesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockAddress: Address = {
    id: 'addr-1',
    userId: 'user-1',
    recipientName: 'Nguyen Van A',
    phone: '0901234567',
    provinceCode: 1,
    provinceName: 'Thành phố Hà Nội',
    wardCode: 1,
    wardName: 'Phường Phúc Xá',
    detailAddress: '123 Hang Bong',
    isDefault: true,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  }

  it('listAddresses calls GET /addresses', async () => {
    const mockResponse = {
      success: true,
      message: 'Danh sách địa chỉ',
      data: [mockAddress],
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await listAddresses()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/addresses'),
      expect.anything()
    )
    expect(result).toEqual([mockAddress])

    const objResult = await addressesApi.listAddresses()
    expect(objResult).toEqual([mockAddress])
  })

  it('createAddress calls POST /addresses with input', async () => {
    const input: AddressInput = {
      recipientName: 'Nguyen Van A',
      phone: '0901234567',
      provinceCode: 1,
      wardCode: 1,
      detailAddress: '123 Hang Bong',
      isDefault: true,
    }

    const mockResponse = {
      success: true,
      message: 'Thêm địa chỉ thành công',
      data: mockAddress,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createAddress(input)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/addresses'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
      })
    )
    expect(result).toEqual(mockAddress)
  })

  it('updateAddress calls PUT /addresses/:id with input', async () => {
    const input: AddressInput = {
      recipientName: 'Nguyen Van B',
      phone: '0901234568',
      provinceCode: 1,
      wardCode: 1,
      detailAddress: '456 Hang Bong',
      isDefault: false,
    }

    const updatedAddr = { ...mockAddress, ...input }
    const mockResponse = {
      success: true,
      message: 'Cập nhật địa chỉ thành công',
      data: updatedAddr,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await updateAddress('addr-1', input)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/addresses/addr-1'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(input),
      })
    )
    expect(result).toEqual(updatedAddr)
  })

  it('deleteAddress calls DELETE /addresses/:id', async () => {
    const mockResponse = {
      success: true,
      message: 'Xóa địa chỉ thành công',
      data: null,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    await deleteAddress('addr-1')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/addresses/addr-1'),
      expect.objectContaining({
        method: 'DELETE',
      })
    )
  })

  it('setDefaultAddress calls PATCH /addresses/:id/default', async () => {
    const mockResponse = {
      success: true,
      message: 'Đặt địa chỉ mặc định thành công',
      data: mockAddress,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await setDefaultAddress('addr-1')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/addresses/addr-1/default'),
      expect.objectContaining({
        method: 'PATCH',
      })
    )
    expect(result).toEqual(mockAddress)
  })
})
