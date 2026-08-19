import { apiClient } from './client'
import type { Address, AddressInput } from './types'

export async function listAddresses(): Promise<Address[]> {
  return apiClient<Address[]>('/addresses')
}

export async function createAddress(input: AddressInput): Promise<Address> {
  return apiClient<Address>('/addresses', {
    method: 'POST',
    body: input,
  })
}

export async function updateAddress(id: string, input: AddressInput): Promise<Address> {
  return apiClient<Address>(`/addresses/${id}`, {
    method: 'PUT',
    body: input,
  })
}

export async function deleteAddress(id: string): Promise<void> {
  return apiClient<void>(`/addresses/${id}`, {
    method: 'DELETE',
  })
}

export async function setDefaultAddress(id: string): Promise<Address> {
  return apiClient<Address>(`/addresses/${id}/default`, {
    method: 'PATCH',
  })
}

export const addressesApi = {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
}
