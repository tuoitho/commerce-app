import type { BuyAgainResult, DeliveryMethod, OrderStatus } from '@/api/types'

const BUY_AGAIN_ALLOWED_STATUSES = new Set<OrderStatus>([
  'delivered',
  'partially_returned',
  'returned',
  'cancelled',
])

export function canBuyAgainOrder(status: OrderStatus): boolean {
  return BUY_AGAIN_ALLOWED_STATUSES.has(status)
}

export function getDeliveryMethodLabel(method?: DeliveryMethod | string | null): string {
  return method === 'express_2h' ? 'Giao hỏa tốc 2 giờ' : 'Giao tiêu chuẩn'
}

export function formatBuyAgainFeedback(result: BuyAgainResult): {
  title: string
  description: string
} {
  const parts: string[] = [`Đã thêm ${result.addedCount} sản phẩm vào giỏ hàng.`]

  if (result.adjustedItems && result.adjustedItems.length > 0) {
    const adjustedText = result.adjustedItems
      .map((item) => `${item.productName} (còn ${item.addedQuantity}/${item.requestedQuantity})`)
      .join(', ')
    parts.push(`Điều chỉnh theo tồn kho: ${adjustedText}.`)
  }

  if (result.skippedItems && result.skippedItems.length > 0) {
    const skippedText = result.skippedItems
      .map((item) =>
        `${item.productName} (${item.reason === 'out_of_stock' ? 'hết hàng' : 'ngừng kinh doanh'})`
      )
      .join(', ')
    parts.push(`Bỏ qua: ${skippedText}.`)
  }

  return {
    title: 'Đã thêm sản phẩm vào giỏ hàng',
    description: parts.join(' '),
  }
}
