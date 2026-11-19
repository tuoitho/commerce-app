import type { ProductVariant, VariantFlashSale } from '@/api/types'

export type PromoPriceSource = 'live' | 'flash_sale' | 'regular'

export interface VariantEffectivePricing {
  source: PromoPriceSource
  effectivePriceVnd: string
  regularPriceVnd: string
  isDiscounted: boolean
  isFlashSaleRunning: boolean
  isFlashSaleSoldOut: boolean
  flashSale: VariantFlashSale | null
  liveRemaining: number | null
}

/**
 * Resolves the effective price for a variant following PD-4:
 * when both live price and an active in-quota flash sale apply, pick the lower
 * price (ties go to live).
 */
export function getVariantEffectivePricing(
  variant: ProductVariant | null | undefined,
  nowMs: number = Date.now()
): VariantEffectivePricing {
  if (!variant) {
    return {
      source: 'regular',
      effectivePriceVnd: '0',
      regularPriceVnd: '0',
      isDiscounted: false,
      isFlashSaleRunning: false,
      isFlashSaleSoldOut: false,
      flashSale: null,
      liveRemaining: null,
    }
  }

  const regularPriceVnd = variant.priceVnd || '0'
  const regularNum = Number(regularPriceVnd)
  const livePriceVnd = variant.livePriceVnd ?? null
  const liveNum = livePriceVnd ? Number(livePriceVnd) : NaN
  const hasLive = !Number.isNaN(liveNum) && liveNum > 0

  const flashSale = variant.flashSale ?? null
  const flashEndMs = flashSale?.endsAt ? new Date(flashSale.endsAt).getTime() : NaN
  const isFlashSaleRunning = Boolean(flashSale && !Number.isNaN(flashEndMs) && flashEndMs > nowMs)
  const isFlashSaleSoldOut = Boolean(flashSale && flashSale.soldQuantity >= flashSale.quota)
  const flashNum =
    isFlashSaleRunning && !isFlashSaleSoldOut && flashSale
      ? Number(flashSale.flashPriceVnd)
      : NaN
  const hasFlash =
    !Number.isNaN(flashNum) &&
    flashNum > 0 &&
    !Number.isNaN(regularNum) &&
    flashNum < regularNum

  let source: PromoPriceSource = 'regular'
  if (hasLive && hasFlash) {
    source = flashNum < liveNum ? 'flash_sale' : 'live'
  } else if (hasLive) {
    source = 'live'
  } else if (hasFlash) {
    source = 'flash_sale'
  }

  const effectivePriceVnd =
    source === 'live' && livePriceVnd
      ? livePriceVnd
      : source === 'flash_sale' && flashSale
      ? flashSale.flashPriceVnd
      : regularPriceVnd

  return {
    source,
    effectivePriceVnd,
    regularPriceVnd,
    isDiscounted: source !== 'regular',
    isFlashSaleRunning,
    isFlashSaleSoldOut,
    flashSale,
    liveRemaining: variant.liveRemaining ?? null,
  }
}
