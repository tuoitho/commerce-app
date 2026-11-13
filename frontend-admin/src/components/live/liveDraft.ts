import type { LiveProduct, LiveProductInput } from '@/api/live'
import type { ProductDetail } from '@/api/types'
import { buildCombinationLabel } from '@/lib/cartesian'

/** One variant row of the live cart editor; prices are raw VND digit strings. */
export interface DraftVariant {
  variantId: string
  label: string
  regularPriceVnd: string
  livePriceVnd: string
  /** Empty means no quota (limited by stock only). */
  quota: string
  sold: number
}

export interface DraftProduct {
  productId: string
  name: string
  imageUrl: string
  variants: DraftVariant[]
}

export type DraftErrors = Record<string, string>

export const productErrorKey = (productId: string) => `product:${productId}`
export const variantErrorKey = (productId: string, variantId: string, field: 'variantId' | 'livePriceVnd' | 'quota') =>
  `variant:${productId}:${variantId}:${field}`

export function draftFromDetail(detail: ProductDetail): DraftProduct {
  const groups = detail.optionGroups ?? []
  return {
    productId: detail.id,
    name: detail.name,
    imageUrl: detail.imageUrls?.[0] ?? detail.primaryImageUrl ?? '',
    variants: (detail.variants ?? [])
      .filter((v) => v.active)
      .map((v) => ({
        variantId: v.id,
        label: buildCombinationLabel(v.optionValueIds, groups) || 'Mặc định',
        regularPriceVnd: v.priceVnd ?? v.priceVND ?? '0',
        livePriceVnd: '',
        quota: '',
        sold: 0,
      })),
  }
}

/** Copies the session's live prices, quotas and sold counts onto a draft. */
export function withSessionPrices(draft: DraftProduct, product: LiveProduct | undefined): DraftProduct {
  if (!product) return draft
  return {
    ...draft,
    variants: draft.variants.map((v) => {
      const price = product.livePrices.find((p) => p.variantId === v.variantId)
      return price
        ? { ...v, livePriceVnd: price.livePriceVnd, quota: price.quota === null ? '' : String(price.quota), sold: price.sold }
        : v
    }),
  }
}

/** Builds the request body; only variants with a live price are sent. */
export function toLiveProductInputs(drafts: DraftProduct[]): LiveProductInput[] {
  return drafts.map((d) => ({
    productId: d.productId,
    variants: d.variants
      .filter((v) => v.livePriceVnd.trim() !== '')
      .map((v) => ({
        variantId: v.variantId,
        livePriceVnd: v.livePriceVnd.trim(),
        quota: v.quota.trim() === '' ? null : Number(v.quota),
      })),
  }))
}

const VARIANT_FIELD = /^products\[(\d+)\]\.variants\[(\d+)\]\.(variantId|livePriceVnd|quota)$/
const PRODUCT_FIELD = /^products\[(\d+)\]\.productId$/

/** Maps API field paths (products[i].variants[j].field) back to editor rows. */
export function mapFieldErrors(fields: Record<string, string>, drafts: DraftProduct[]): DraftErrors {
  const inputs = toLiveProductInputs(drafts)
  const errors: DraftErrors = {}
  for (const [path, message] of Object.entries(fields)) {
    const variantMatch = VARIANT_FIELD.exec(path)
    if (variantMatch) {
      const product = inputs[Number(variantMatch[1])]
      const variant = product?.variants[Number(variantMatch[2])]
      if (product && variant) {
        errors[variantErrorKey(product.productId, variant.variantId, variantMatch[3] as 'variantId' | 'livePriceVnd' | 'quota')] = message
        continue
      }
    }
    const productMatch = PRODUCT_FIELD.exec(path)
    if (productMatch && inputs[Number(productMatch[1])]) {
      errors[productErrorKey(inputs[Number(productMatch[1])].productId)] = message
      continue
    }
    errors[path] = message
  }
  return errors
}
