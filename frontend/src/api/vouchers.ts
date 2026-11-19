import { apiClient } from './client'
import type { AvailableVoucher, CheckoutQuote, CheckoutQuoteInput } from './types'

export async function listAvailableVouchers(): Promise<AvailableVoucher[]> {
  return apiClient<AvailableVoucher[]>('/vouchers/available')
}

export async function quoteCheckout(input: CheckoutQuoteInput): Promise<CheckoutQuote> {
  const trimmedVoucher = input.voucherCode?.trim()
  const body: CheckoutQuoteInput = {
    addressId: input.addressId,
    ...(input.deliveryMethod ? { deliveryMethod: input.deliveryMethod } : {}),
    ...(trimmedVoucher ? { voucherCode: trimmedVoucher } : {}),
  }
  return apiClient<CheckoutQuote>('/checkout/quote', {
    method: 'POST',
    body,
  })
}

export const vouchersApi = {
  listAvailable: listAvailableVouchers,
  listAvailableVouchers,
  quoteCheckout,
}
