import { apiClient } from './client'
import type { Province, Ward } from './types'

export async function listProvinces(): Promise<Province[]> {
  return apiClient<Province[]>('/provinces')
}

export async function listWards(provinceCode: number): Promise<Ward[]> {
  return apiClient<Ward[]>(`/provinces/${provinceCode}/wards`)
}

export const areasApi = {
  listProvinces,
  listWards,
}
