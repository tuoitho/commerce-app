import { apiClient } from './client'
import type { FlashSaleCampaign } from './types'

export const flashSalesApi = {
  async getCurrentFlashSale(): Promise<FlashSaleCampaign | null> {
    return apiClient<FlashSaleCampaign | null>('/flash-sales/current', { skipAuthRefresh: true })
  },
}
