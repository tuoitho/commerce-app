import { apiClient } from './client'
import type { Category } from './types'

export async function getCategories(): Promise<Category[]> {
  return apiClient<Category[]>('/categories')
}
