import { apiClient } from './client'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from './types'

export async function getCategories(): Promise<Category[]> {
  return apiClient<Category[]>('/categories')
}

export async function getAdminCategories(): Promise<Category[]> {
  return apiClient<Category[]>('/admin/categories')
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  return apiClient<Category>('/admin/categories', { method: 'POST', body: input })
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  return apiClient<Category>(`/admin/categories/${encodeURIComponent(id)}`, { method: 'PUT', body: input })
}

export async function deleteCategory(id: string): Promise<Category> {
  return apiClient<Category>(`/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
