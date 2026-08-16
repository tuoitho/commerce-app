import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { cartApi } from '@/api/cart'
import type { Cart } from '@/api/types'
import { useAuth } from './AuthContext'

interface CartContextType {
  cart: Cart | null
  isLoading: boolean
  badgeCount: number
  refreshCart: () => Promise<void>
  addItem: (variantId: string) => Promise<Cart>
  updateQuantity: (itemId: string, quantity: number) => Promise<Cart>
  toggleSelect: (itemId: string, selected: boolean) => Promise<Cart>
  toggleSelectAll: (selected: boolean) => Promise<Cart>
  removeItem: (itemId: string) => Promise<Cart>
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [cart, setCart] = useState<Cart | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const refreshCart = useCallback(async () => {
    if (!isAuthenticated) {
      setCart(null)
      return
    }
    try {
      setIsLoading(true)
      const res = await cartApi.getCart()
      setCart(res)
    } catch {
      // If unauthorized or error, keep null
      setCart(null)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      refreshCart()
    } else {
      setCart(null)
    }
  }, [isAuthenticated, refreshCart])

  const addItem = useCallback(
    async (variantId: string): Promise<Cart> => {
      const res = await cartApi.addItem(variantId)
      setCart(res)
      return res
    },
    []
  )

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number): Promise<Cart> => {
      const res = await cartApi.setQuantity(itemId, quantity)
      setCart(res)
      return res
    },
    []
  )

  const toggleSelect = useCallback(
    async (itemId: string, selected: boolean): Promise<Cart> => {
      const res = await cartApi.setSelection(itemId, selected)
      setCart(res)
      return res
    },
    []
  )

  const toggleSelectAll = useCallback(
    async (selected: boolean): Promise<Cart> => {
      const res = await cartApi.setAllSelection(selected)
      setCart(res)
      return res
    },
    []
  )

  const removeItem = useCallback(
    async (itemId: string): Promise<Cart> => {
      const res = await cartApi.removeItem(itemId)
      setCart(res)
      return res
    },
    []
  )

  const badgeCount = cart?.totalUnits ?? 0

  return (
    <CartContext.Provider
      value={{
        cart,
        isLoading,
        badgeCount,
        refreshCart,
        addItem,
        updateQuantity,
        toggleSelect,
        toggleSelectAll,
        removeItem,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
