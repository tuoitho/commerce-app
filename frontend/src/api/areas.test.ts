import { describe, it, expect, beforeEach, vi } from 'vitest'
import { areasApi, listProvinces, listWards } from './areas'

describe('areasApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('listProvinces calls /provinces and returns province array', async () => {
    const mockProvinces = [
      { code: 1, name: 'Thành phố Hà Nội' },
      { code: 79, name: 'Thành phố Hồ Chí Minh' },
    ]
    const mockResponse = {
      success: true,
      message: 'Danh sách tỉnh/thành phố',
      data: mockProvinces,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await listProvinces()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/provinces'),
      expect.anything()
    )
    expect(result).toEqual(mockProvinces)

    const objResult = await areasApi.listProvinces()
    expect(objResult).toEqual(mockProvinces)
  })

  it('listWards calls /provinces/:code/wards and returns ward array', async () => {
    const mockWards = [
      { code: 1, provinceCode: 1, name: 'Phường Phúc Xá' },
      { code: 2, provinceCode: 1, name: 'Phường Trúc Bạch' },
    ]
    const mockResponse = {
      success: true,
      message: 'Danh sách phường/xã',
      data: mockWards,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await listWards(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/provinces/1/wards'),
      expect.anything()
    )
    expect(result).toEqual(mockWards)

    const objResult = await areasApi.listWards(1)
    expect(objResult).toEqual(mockWards)
  })
})
