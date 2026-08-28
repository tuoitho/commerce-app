import { apiClient } from './client'
import type { CreateReturnInput, ReturnRequest } from './types'

export async function createReturn(
  orderId: string,
  input: CreateReturnInput
): Promise<ReturnRequest> {
  return apiClient<ReturnRequest>(`/orders/${orderId}/returns`, {
    method: 'POST',
    body: input,
  })
}

export async function cancelReturn(
  orderId: string,
  returnId: string
): Promise<ReturnRequest> {
  return apiClient<ReturnRequest>(
    `/orders/${orderId}/returns/${returnId}/cancel`,
    {
      method: 'POST',
    }
  )
}
