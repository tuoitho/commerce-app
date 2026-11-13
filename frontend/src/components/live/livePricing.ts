import type { LiveProduct, LiveVariantPrice } from '@/api/live'
import { formatVND } from '@/lib/utils'

export function formatPriceRange(min: string, max: string): string {
  return min === max ? formatVND(min) : `${formatVND(min)} – ${formatVND(max)}`
}

/** A live price that was configured but has no units left at that price. */
export function isQuotaExhausted(price: LiveVariantPrice | undefined): boolean {
  return !!price && !price.active && price.quota !== null && price.remaining === 0
}

/** The product had live prices, but every one of them has run out. */
export function allLiveQuotaExhausted(product: LiveProduct): boolean {
  return !product.hasLivePrice && product.livePrices.length > 0 && product.livePrices.every(isQuotaExhausted)
}
