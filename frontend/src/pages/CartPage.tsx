import { useState } from 'react'
import { Link } from 'react-router-dom'

import ProductImage from '../components/ProductImage'
import { useCart } from '../cart/CartProvider'
import { formatPrice } from '../catalog/format'
import type { CartItem } from '../api/cart'

function availabilityMessage(item: CartItem): string | null {
  if (item.availability === 'insufficient_stock') return `Quantity exceeds current stock (${item.stockQuantity} available)`
  if (item.availability === 'out_of_stock') return 'Out of stock'
  if (item.availability === 'unavailable') return 'No longer available'
  return null
}

function CartRow({ item, pending, onQuantity, onSelected, onRemove }: {
  item: CartItem
  pending: boolean
  onQuantity(itemId: string, quantity: bigint): void
  onSelected(itemId: string, selected: boolean): Promise<void>
  onRemove(itemId: string): void
}) {
  const restricted = item.availability === 'out_of_stock' || item.availability === 'unavailable'
  const canEditQuantity = !restricted
  const stockLimit = item.stockQuantity
  const decrementQuantity = item.availability === 'insufficient_stock'
    ? (item.quantity - 1n < 1n ? 1n : item.quantity - 1n > stockLimit ? stockLimit : item.quantity - 1n)
    : item.quantity - 1n
  const message = availabilityMessage(item)

  return (
    <article className={`cart-row cart-row-${item.availability}`}>
      <label className="cart-select">
        <input
          type="checkbox"
          checked={item.availability === 'available' && item.selected}
          disabled={pending || item.availability !== 'available'}
          aria-label={`Select ${item.productName}`}
          onChange={(event) => onSelected(item.id, event.target.checked)}
        />
        Select
      </label>
      <ProductImage src={item.imageUrl} alt={item.productName} className="cart-image" />
      <div className="cart-item-details">
        <p className="product-category">{item.brandName}</p>
        <h2>{item.productName}</h2>
        <p className="product-model">{item.model}</p>
        <ul className="cart-options">
          {item.options.map((option) => <li key={`${option.groupLabel}-${option.valueLabel}`}>{option.groupLabel}: {option.valueLabel}</li>)}
        </ul>
        {message ? <p className="cart-availability" role="status">{message}</p> : <p className="cart-stock">{item.stockQuantity} available</p>}
      </div>
      <div className="cart-item-pricing">
        {item.availability === 'out_of_stock' || item.availability === 'unavailable' ? (
          <p className="cart-availability">Price unavailable</p>
        ) : (
          <>
            <p>Unit price: <strong>{formatPrice(item.unitPriceVnd ?? '0')}</strong></p>
            <p>Line total: <strong>{formatPrice(item.lineTotalVnd ?? '0')}</strong></p>
          </>
        )}
      </div>
      <div className="cart-quantity" aria-label={`Quantity controls for item ${item.id}`}>
        <button type="button" disabled={pending || !canEditQuantity || item.quantity <= 1n} aria-label={`Decrease quantity for item ${item.id}`} onClick={() => onQuantity(item.id, decrementQuantity)}>-</button>
        <output aria-label={`Quantity for item ${item.id}`}>{item.quantity}</output>
        <button type="button" disabled={pending || !canEditQuantity || item.quantity >= item.stockQuantity} aria-label={`Increase quantity for item ${item.id}`} onClick={() => onQuantity(item.id, item.quantity + 1n)}>+</button>
      </div>
      <button type="button" className="cart-remove" disabled={pending} aria-label={`Remove item ${item.id}`} onClick={() => onRemove(item.id)}>Remove</button>
    </article>
  )
}

export default function CartPage() {
  const { cart, loading, pending, error, reload, setQuantity, setSelected, setAllSelected, remove } = useCart()
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null)
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null)

  if (loading && !cart) {
    return <main className="cart-page"><h1>Cart</h1><p className="cart-status" aria-live="polite">Loading cart...</p></main>
  }

  if (error && !cart) {
    return <main className="cart-page"><h1>Cart</h1><div className="cart-status error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Try again</button></div></main>
  }

  if (!cart || cart.items.length === 0) {
    return <main className="cart-page"><h1>Cart</h1>{error && <div className="cart-status error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Try again</button></div>}<section className="cart-empty"><h2>Your cart is empty</h2><p>Find a phone to get started.</p><Link to="/products">Continue shopping</Link></section></main>
  }

  const selectableItems = cart.items.filter((item) => item.availability === 'available')
  const allSelected = selectableItems.length > 0 && selectableItems.every((item) => item.selected)
  const selectedLabel = `${cart.selectedLineCount} selected ${cart.selectedLineCount === 1 ? 'item' : 'items'}`
  const handleSelected = (itemId: string, selected: boolean) => {
    setSelectionMessage(null)
    return Promise.resolve(setSelected(itemId, selected)).then((successful) => {
    if (successful !== true) return
    const item = cart.items.find((candidate) => candidate.id === itemId)
    setSelectionMessage(`${item?.productName ?? 'Item'} selection ${selected ? 'saved' : 'cleared'}.`)
    })
  }
  const handleAllSelected = (selected: boolean) => {
    setSelectionMessage(null)
    return Promise.resolve(setAllSelected(selected)).then((successful) => {
    if (successful !== true) return
    setSelectionMessage(selected ? 'All available items selected.' : 'All items unselected.')
    })
  }

  return (
    <main className="cart-page">
      <h1>Cart</h1>
      {loading && <p className="cart-status" aria-live="polite">Refreshing cart...</p>}
      {error && <div className="cart-status error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Try again</button></div>}
      <section className="cart-summary" aria-label="Cart summary">
        <label>
          <input
            type="checkbox"
            aria-label="Select all available items"
            checked={allSelected}
            disabled={pending || selectableItems.length === 0}
            onChange={(event) => void handleAllSelected(event.target.checked)}
          />
          Select all available items
        </label>
        <p>{selectedLabel}</p>
        <p>Total: <strong>{formatPrice(cart.selectedTotalVnd)}</strong></p>
        <button
          type="button"
          disabled={pending || cart.selectedLineCount === 0}
          onClick={() => setCheckoutMessage('Checkout is outside the current scope. Order creation and payment are not available yet.')}
        >
          Continue to checkout
        </button>
        {selectionMessage && <p role="status" aria-live="polite">{selectionMessage}</p>}
        {checkoutMessage && <p role="status" aria-live="polite">{checkoutMessage}</p>}
      </section>
      <section className="cart-items" aria-label="Cart items">
        {cart.items.map((item) => <CartRow key={item.id} item={item} pending={pending} onQuantity={(id, quantity) => void setQuantity(id, quantity)} onSelected={handleSelected} onRemove={(id) => void remove(id)} />)}
      </section>
    </main>
  )
}
