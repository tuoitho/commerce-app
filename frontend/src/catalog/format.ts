export function formatPrice(price: string, currency: string): string {
  const value = Number(price)
  if (!Number.isFinite(value)) return `${price} ${currency}`
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
  } catch {
    return `${price} ${currency}`
  }
}
