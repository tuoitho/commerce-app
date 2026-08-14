export function formatPrice(price: string): string {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(BigInt(price))
  } catch {
    return `${price} ₫`
  }
}
