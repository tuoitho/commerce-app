import { api } from './client'

export type CartAvailability = 'available' | 'unavailable' | 'out_of_stock' | 'insufficient_stock'

export interface CartOption {
  groupLabel: string
  valueLabel: string
}

export interface CartItem {
  id: string
  variantId: string
  productId: string
  brandName: string
  productName: string
  model: string
  imageUrl: string
  options: CartOption[]
  unitPriceVnd: string | null
  lineTotalVnd: string | null
  stockQuantity: bigint
  quantity: bigint
  selected: boolean
  availability: CartAvailability
}

export interface Cart {
  items: CartItem[]
  totalUnits: bigint
  selectedLineCount: number
  selectedTotalVnd: string
}

export interface CartApi {
  fetchCart(): Promise<Cart>
  addVariant(variantId: string): Promise<Cart>
  setQuantity(itemId: string, quantity: bigint): Promise<Cart>
  setSelected(itemId: string, selected: boolean): Promise<Cart>
  setAllSelected(selected: boolean): Promise<Cart>
  remove(itemId: string): Promise<Cart>
}

const unwrap = (body: { cart: Cart }) => body.cart

export function createCartApi(request = api): CartApi {
  return {
    fetchCart: () => request.get<{ cart: Cart }>('/cart').then(unwrap),
    addVariant: (variantId) => request.post<{ cart: Cart }>('/cart/items', { variantId }).then(unwrap),
    setQuantity: (itemId, quantity) => request.put<{ cart: Cart }>(`/cart/items/${encodeURIComponent(itemId)}`, { quantity }).then(unwrap),
    setSelected: (itemId, selected) => request.patch<{ cart: Cart }>(`/cart/items/${encodeURIComponent(itemId)}/selection`, { selected }).then(unwrap),
    setAllSelected: (selected) => request.put<{ cart: Cart }>('/cart/selection', { selected }).then(unwrap),
    remove: (itemId) => request.delete<{ cart: Cart }>(`/cart/items/${encodeURIComponent(itemId)}`).then(unwrap),
  }
}

export function fetchCart(): Promise<Cart> {
  return createCartApi().fetchCart()
}

export function addVariant(variantId: string): Promise<Cart> {
  return createCartApi().addVariant(variantId)
}

export function setQuantity(itemId: string, quantity: bigint): Promise<Cart> {
  return createCartApi().setQuantity(itemId, quantity)
}

export function setSelected(itemId: string, selected: boolean): Promise<Cart> {
  return createCartApi().setSelected(itemId, selected)
}

export function setAllSelected(selected: boolean): Promise<Cart> {
  return createCartApi().setAllSelected(selected)
}

export function remove(itemId: string): Promise<Cart> {
  return createCartApi().remove(itemId)
}
