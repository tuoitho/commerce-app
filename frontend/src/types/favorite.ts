export type FavoriteAvailability = 'active' | 'unavailable' | 'deleted'

export interface FavoriteProduct {
  id: string
  name: string
  model: string
  brand: string
  category: {
    id: string
    name: string
  }
  primaryImageUrl: string
  availability: FavoriteAvailability
  minPriceVnd: string | null
  maxPriceVnd: string | null
  inStock: boolean | null
}
