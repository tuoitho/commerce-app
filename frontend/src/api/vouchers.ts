import { apiClient } from './client'
import type {
  AvailableVoucher,
  CheckoutQuote,
  CheckoutQuoteInput,
  DiscoverVoucher,
  UserVoucher,
} from './types'

export type WalletStatusFilter = 'available' | 'used_up' | 'unavailable'

export async function listAvailableVouchers(): Promise<AvailableVoucher[]> {
  return apiClient<AvailableVoucher[]>('/vouchers/available')
}

export async function listDiscoverVouchers(): Promise<DiscoverVoucher[]> {
  return apiClient<DiscoverVoucher[]>('/vouchers/discover')
}

export async function claimVoucher(voucherId: string): Promise<UserVoucher> {
  return apiClient<UserVoucher>(`/vouchers/${encodeURIComponent(voucherId)}/claim`, {
    method: 'POST',
  })
}

export async function listWalletVouchers(status?: WalletStatusFilter): Promise<UserVoucher[]> {
  const path = status ? `/vouchers/wallet?status=${encodeURIComponent(status)}` : '/vouchers/wallet'
  return apiClient<UserVoucher[]>(path)
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
  listDiscover: listDiscoverVouchers,
  listDiscoverVouchers,
  claim: claimVoucher,
  claimVoucher,
  listWallet: listWalletVouchers,
  listWalletVouchers,
  quoteCheckout,
}
