import { useEffect, useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ShoppingCart,
  ShieldCheck,
  Truck,
  RotateCcw,
  AlertCircle,
  Smartphone,
  ChevronRight,
  CreditCard,
  Sparkles,
  Share2,
  CheckCircle2,
  PhoneCall,
  Clock,
  Star,
  Zap,
} from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import { ApiError } from '@/api/types'
import type {
  ProductDetail,
  ProductVariant,
  ProductReviewSummary,
} from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { useCountdown } from '@/hooks/useCountdown'
import { getVariantEffectivePricing } from '@/lib/pricing'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { FavoriteToggleButton } from '@/components/FavoriteToggleButton'
import { CompareToggleButton } from '@/components/CompareToggleButton'
import { ProductReviewsSection } from '@/components/ProductReviewsSection'

function formatVND(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value
  if (isNaN(num)) return '0 ₫'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(num)
}

function getColorCode(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('đen') || l.includes('black') || l.includes('space black') || l.includes('midnight')) return '#18181b'
  if (l.includes('trắng') || l.includes('white') || l.includes('starlight') || l.includes('silver') || l.includes('bạc')) return '#f4f4f5'
  if (l.includes('vàng') || l.includes('gold') || l.includes('sa mạc') || l.includes('desert')) return '#d4af37'
  if (l.includes('xanh lá') || l.includes('green') || l.includes('emerald') || l.includes('mint')) return '#10b981'
  if (l.includes('xanh dương') || l.includes('blue') || l.includes('titan xanh') || l.includes('navy')) return '#2563eb'
  if (l.includes('titan') || l.includes('grey') || l.includes('gray') || l.includes('xám')) return '#71717a'
  if (l.includes('tím') || l.includes('purple') || l.includes('violet')) return '#8b5cf6'
  if (l.includes('hồng') || l.includes('pink') || l.includes('rose')) return '#f43f5e'
  if (l.includes('cam') || l.includes('orange')) return '#f97316'
  return '#71717a'
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { addItem } = useCart()
  const { success, error: toastError } = useToast()

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [isAddingToCart, setIsAddingToCart] = useState(false)
  const [activeTab, setActiveTab] = useState<'specs' | 'highlights' | 'warranty'>('specs')
  const [reviewSummary, setReviewSummary] = useState<ProductReviewSummary | null>(null)

  useEffect(() => {
    if (!id) return
    setIsLoading(true)
    setError(null)
    catalogApi
      .getProduct(id)
      .then((data) => {
        setProduct(data)
        if (data && data.optionGroups && data.optionGroups.length > 0) {
          const initial: Record<string, string> = {}
          data.optionGroups.forEach((g) => {
            if (g.values && g.values.length > 0) {
              initial[g.id] = g.values[0].id
            }
          })
          setSelectedOptions(initial)
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to load product', err)
        setError('Không thể tải thông tin sản phẩm. Vui lòng thử lại sau.')
      })
      .finally(() => setIsLoading(false))
  }, [id])

  const selectedVariant = useMemo<ProductVariant | null>(() => {
    if (!product || !product.variants || product.variants.length === 0) return null
    if (!product.optionGroups || product.optionGroups.length === 0) {
      return product.variants[0] || null
    }

    return (
      product.variants.find((variant) => {
        return Object.entries(selectedOptions).every(
          ([groupId, valueId]) => variant.optionValueIds[groupId] === valueId
        )
      }) || null
    )
  }, [product, selectedOptions])

  const allGroupsSelected = useMemo(() => {
    if (!product || !product.optionGroups || product.optionGroups.length === 0) return true
    return product.optionGroups.every((g) => Boolean(selectedOptions[g.id]))
  }, [product, selectedOptions])

  const livePriceVnd = selectedVariant?.livePriceVnd ?? null
  const flashSale = selectedVariant?.flashSale ?? null
  const flashCountdown = useCountdown(flashSale?.endsAt)
  const variantPricing = useMemo(() => {
    const endMs = flashSale?.endsAt ? new Date(flashSale.endsAt).getTime() : NaN
    const nowMs =
      flashCountdown.isExpired && !Number.isNaN(endMs)
        ? Math.max(Date.now(), endMs)
        : Date.now()
    return getVariantEffectivePricing(selectedVariant, nowMs)
  }, [selectedVariant, flashSale?.endsAt, flashCountdown.isExpired])
  const isFlashSaleRunning = Boolean(flashSale && !flashCountdown.isExpired)
  const isFlashSaleSoldOut = variantPricing.isFlashSaleSoldOut
  const activePromoSource = variantPricing.source

  const numericPrice = useMemo(() => {
    if (activePromoSource === 'live' && livePriceVnd) return Number(livePriceVnd)
    if (activePromoSource === 'flash_sale' && flashSale) return Number(flashSale.flashPriceVnd)
    if (selectedVariant && selectedVariant.priceVnd) return Number(selectedVariant.priceVnd)
    if (product?.price) return Number(product.price)
    if (product?.minPriceVnd) return Number(product.minPriceVnd)
    return 0
  }, [activePromoSource, livePriceVnd, flashSale, selectedVariant, product])

  const displayedPrice = useMemo(() => {
    if (activePromoSource === 'live' && livePriceVnd) {
      return formatVND(livePriceVnd)
    }
    if (activePromoSource === 'flash_sale' && flashSale) {
      return formatVND(flashSale.flashPriceVnd)
    }
    if (selectedVariant && selectedVariant.priceVnd) {
      return formatVND(selectedVariant.priceVnd)
    }
    if (product?.price) {
      return formatVND(product.price)
    }
    if (product?.minPriceVnd) {
      return formatVND(product.minPriceVnd)
    }
    return '0 ₫'
  }, [activePromoSource, livePriceVnd, flashSale, selectedVariant, product])

  const monthlyInstallment = useMemo(() => {
    if (!numericPrice || numericPrice <= 0) return 0
    return Math.round(numericPrice / 12)
  }, [numericPrice])

  const isAvailable = useMemo(() => {
    if (!product) return false
    if (product.optionGroups?.length > 0) {
      if (!allGroupsSelected) return product.inStock
      return selectedVariant ? (selectedVariant.active !== false && selectedVariant.stockQuantity > 0) : false
    }
    return product.stockQuantity > 0
  }, [product, allGroupsSelected, selectedVariant])

  const handleSelectOption = (groupId: string, valueId: string) => {
    setSelectedOptions((prev) => {
      const next = { ...prev, [groupId]: valueId }
      if (!product?.variants) return next

      for (const [gId, vId] of Object.entries(next)) {
        if (gId === groupId) continue
        const isCompatible = product.variants.some(
          (variant) =>
            variant.optionValueIds[groupId] === valueId &&
            variant.optionValueIds[gId] === vId
        )
        if (!isCompatible) {
          delete next[gId]
        }
      }
      return next
    })
  }

  const isValueSelectable = (groupId: string, valueId: string) => {
    if (!product?.variants) return true
    const testSelection = { ...selectedOptions, [groupId]: valueId }
    return product.variants.some((v) => {
      return Object.entries(testSelection).every(
        ([gId, vId]) => !vId || v.optionValueIds[gId] === vId
      )
    })
  }

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=/products/${id}`)
      return
    }

    if (!allGroupsSelected) {
      toastError('Vui lòng chọn phân loại', 'Hãy chọn đầy đủ các tuỳ chọn của sản phẩm.')
      return
    }

    if (!selectedVariant || selectedVariant.active === false || selectedVariant.stockQuantity <= 0) {
      toastError('Hết hàng', 'Phiên bản sản phẩm này tạm thời hết hàng.')
      return
    }

    setIsAddingToCart(true)
    try {
      await addItem(selectedVariant.id)
      success(
        'Đã thêm vào giỏ hàng!',
        `${product?.name} đã được thêm vào giỏ hàng thành công.`
      )
    } catch (err: unknown) {
      console.error(err)
      if (err instanceof ApiError && err.code === 'stock_limit') {
        toastError('Vượt quá tồn kho', err.message || 'Số lượng vượt quá tồn kho khả dụng.')
      } else {
        toastError('Thêm vào giỏ thất bại', 'Không thể thêm sản phẩm vào giỏ. Vui lòng thử lại.')
      }
    } finally {
      setIsAddingToCart(false)
    }
  }

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href)
      success('Đã sao chép liên kết!', 'Bạn có thể chia sẻ sản phẩm này cho bạn bè.')
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8 animate-fade-in">
        <Skeleton className="h-6 w-56 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-6 space-y-4">
            <Skeleton className="h-[460px] w-full rounded-2xl" />
            <div className="flex gap-3">
              <Skeleton className="h-20 w-20 rounded-xl" />
              <Skeleton className="h-20 w-20 rounded-xl" />
              <Skeleton className="h-20 w-20 rounded-xl" />
            </div>
          </div>
          <div className="lg:col-span-6 space-y-6">
            <Skeleton className="h-10 w-4/5 rounded-xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center animate-fade-in">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mx-auto mb-4 border border-rose-200">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-extrabold text-zinc-950">Không tìm thấy sản phẩm</h2>
        <p className="text-sm text-zinc-500 mt-2 mb-6 leading-relaxed">
          {error || 'Sản phẩm này có thể đã ngừng kinh doanh hoặc đường dẫn không chính xác.'}
        </p>
        <Link to="/products">
          <Button variant="default" className="gap-2 rounded-xl font-semibold bg-zinc-950 hover:bg-emerald-700">
            <ArrowLeft className="h-4 w-4" /> Quay lại danh mục điện thoại
          </Button>
        </Link>
      </div>
    )
  }

  const images = product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls : []
  const specs = product.specs ?? []

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-28">
      {/* Breadcrumb Navigation Bar */}
      <div className="border-b border-zinc-200 bg-white py-3.5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <nav className="flex items-center gap-2 text-xs font-medium text-zinc-500 overflow-x-auto whitespace-nowrap">
              <Link to="/" className="hover:text-zinc-950 transition-colors">
                Trang chủ
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <Link to="/products" className="hover:text-zinc-950 transition-colors">
                Điện thoại
              </Link>
              {product.category && (
                <>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <Link
                    to={`/products?category_id=${product.category.id}`}
                    className="hover:text-zinc-950 transition-colors"
                  >
                    {product.category.name}
                  </Link>
                </>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="text-zinc-950 font-semibold truncate max-w-[180px] sm:max-w-xs">
                {product.name}
              </span>
            </nav>

            <div className="flex items-center gap-2">
              <FavoriteToggleButton
                productId={product.id}
                productName={product.name}
              />
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:border-zinc-900 hover:text-zinc-950 transition shrink-0 cursor-pointer"
                title="Chia sẻ sản phẩm"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Chia sẻ</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Flagship Product Presentation */}
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-12 items-start">
          {/* Left Column: Architectural Gallery Pedestal */}
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
              {/* Top Status Bar (Separated from image per anti-slop rule 9.F) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  {isAvailable ? (
                    <Badge variant="success" className="font-semibold text-xs py-0.5 px-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 mr-1.5" />
                      Còn hàng
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="font-semibold text-xs py-0.5 px-2.5">
                      Hết hàng
                    </Badge>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md bg-zinc-950 text-white font-mono text-[10px] uppercase tracking-wider px-2.5 py-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-400" />
                    VNA Nguyên Seal
                  </span>
                </div>

                <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
                  Bảo hành 12 tháng chính hãng
                </span>
              </div>

              {/* Unobstructed Studio Frame */}
              <div className="relative flex h-[360px] sm:h-[430px] w-full items-center justify-center overflow-hidden rounded-xl bg-[#f7f7f5] p-6 group">
                {images.length > 0 ? (
                  <img
                    src={images[selectedImageIndex] || images[0]}
                    alt={`${product.brand || ''} ${product.name}`.trim()}
                    className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <img
                    src="/iphone-16-pro.jpg"
                    alt={`${product.brand || ''} ${product.name}`.trim()}
                    className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
                  />
                )}
              </div>
            </div>

            {/* Thumbnail Carousel */}
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border p-2 bg-white transition-all cursor-pointer ${
                      selectedImageIndex === idx
                        ? 'border-zinc-950 ring-1 ring-zinc-950'
                        : 'border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`Thumbnail ${idx + 1}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Architectural Assurance Ledger */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 p-3.5 text-xs font-semibold text-zinc-800">
                <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>100% Chính hãng</span>
              </div>
              <div className="flex items-center gap-2 p-3.5 text-xs font-semibold text-zinc-800">
                <RotateCcw className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>1 Đổi 1 30 ngày</span>
              </div>
              <div className="flex items-center gap-2 p-3.5 text-xs font-semibold text-zinc-800">
                <Truck className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Giao nhanh 2h</span>
              </div>
              <div className="flex items-center gap-2 p-3.5 text-xs font-semibold text-zinc-800">
                <PhoneCall className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Hỗ trợ 24/7</span>
              </div>
            </div>
          </div>

          {/* Right Column: Configuration & Purchase Matrix */}
          <div className="lg:col-span-6 space-y-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2.5">
                {product.brand && (
                  <Badge variant="outline" className="font-mono uppercase tracking-wider text-[11px] px-2.5 py-0.5">
                    {product.brand}
                  </Badge>
                )}
                {product.model && (
                  <span className="text-xs font-mono font-medium text-zinc-500 bg-zinc-100 border border-zinc-200/80 px-2.5 py-0.5 rounded-md">
                    Model: {product.model}
                  </span>
                )}
                <div className="flex items-center gap-1 text-xs text-zinc-900 font-semibold ml-auto">
                  {reviewSummary && reviewSummary.totalReviews > 0 ? (
                    <>
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      <span className="font-mono">{reviewSummary.averageRating}</span>
                      <span className="text-zinc-500 font-normal">
                        ({reviewSummary.totalReviews} đánh giá)
                      </span>
                    </>
                  ) : (
                    <span className="text-zinc-400 font-normal text-xs">
                      Chưa có đánh giá
                    </span>
                  )}
                </div>
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold text-zinc-950 tracking-tight leading-tight">
                {product.name}
              </h1>
            </div>

            {/* Editorial Price Ledger Card */}
            <div className="p-5 rounded-2xl bg-white border border-zinc-200 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                {activePromoSource === 'live' && selectedVariant ? (
                  <div>
                    <span className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      <span className="live-pulse-dot h-1.5 w-1.5 rounded-full bg-white" />
                      Giá live
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono text-3xl sm:text-4xl font-bold text-rose-600 tracking-tight tabular-nums">
                        {displayedPrice}
                      </span>
                      <span data-testid="pdp-regular-price" className="font-mono text-base text-zinc-400 line-through tabular-nums">
                        {formatVND(selectedVariant.priceVnd)}
                      </span>
                    </div>
                    {selectedVariant.liveRemaining != null && (
                      <span className="mt-1 block text-xs font-semibold text-rose-600">
                        Còn {selectedVariant.liveRemaining} suất giá live
                      </span>
                    )}
                  </div>
                ) : activePromoSource === 'flash_sale' && selectedVariant && flashSale ? (
                  <div>
                    <span className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-950">
                      <Zap className="h-3 w-3 fill-zinc-950" />
                      Flash Sale
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono text-3xl sm:text-4xl font-bold text-rose-600 tracking-tight tabular-nums">
                        {displayedPrice}
                      </span>
                      <span data-testid="pdp-regular-price" className="font-mono text-base text-zinc-400 line-through tabular-nums">
                        {formatVND(selectedVariant.priceVnd)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 block mb-0.5">
                      GIÁ NIÊM YẾT CHÍNH HÃNG
                    </span>
                    <span className="font-mono text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight tabular-nums">
                      {displayedPrice}
                    </span>
                  </div>
                )}
                {selectedVariant && (
                  <span
                    className={`font-mono text-xs font-semibold px-2.5 py-1 rounded-md ${
                      selectedVariant.stockQuantity > 0 && selectedVariant.active !== false
                        ? 'text-emerald-800 bg-emerald-50 border border-emerald-200'
                        : 'text-rose-700 bg-rose-50 border border-rose-200'
                    }`}
                  >
                    {selectedVariant.stockQuantity > 0 && selectedVariant.active !== false
                      ? `Còn ${selectedVariant.stockQuantity} máy sẵn hàng`
                      : 'Hết hàng'}
                  </span>
                )}
              </div>

              {isFlashSaleRunning && flashSale && (
                <div
                  data-testid="pdp-flash-sale-box"
                  className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-950">
                      <Zap className="h-3.5 w-3.5 text-amber-600 fill-amber-500 shrink-0" />
                      <span>{flashSale.campaignName}</span>
                    </div>
                    <div
                      data-testid="pdp-flash-sale-countdown"
                      className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-zinc-950 tabular-nums"
                    >
                      <span className="font-sans text-[11px] font-medium text-zinc-600">Kết thúc sau</span>
                      <span className="rounded-md bg-zinc-950 px-2 py-0.5 text-amber-400">
                        {flashCountdown.formatted}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200/70">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isFlashSaleSoldOut ? 'bg-zinc-400' : 'bg-rose-600'
                        }`}
                        style={{
                          width: `${
                            flashSale.quota > 0
                              ? Math.min(100, Math.round((flashSale.soldQuantity / flashSale.quota) * 100))
                              : 100
                          }%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className={isFlashSaleSoldOut ? 'text-zinc-600' : 'text-rose-700'}>
                        {isFlashSaleSoldOut
                          ? 'Đã hết suất'
                          : `Đã bán ${flashSale.soldQuantity}/${flashSale.quota}`}
                      </span>
                      {activePromoSource === 'live' && (
                        <span className="text-rose-600">Đang áp dụng Giá live tốt hơn</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {monthlyInstallment > 0 && (
                <div className="flex items-center justify-between text-xs text-zinc-600 pt-2.5 border-t border-zinc-100">
                  <span>Chương trình trả góp 0% lãi suất kỳ hạn 12 tháng</span>
                  <strong className="font-mono text-zinc-950 font-bold">
                    {formatVND(monthlyInstallment)}/tháng
                  </strong>
                </div>
              )}
            </div>

            {/* Dynamic Option Groups */}
            {product.optionGroups && product.optionGroups.length > 0 && (
              <div className="space-y-4 pt-1">
                {product.optionGroups.map((group) => {
                  const selectedVal = group.values.find((v) => v.id === selectedOptions[group.id])
                  const isColorGroup = group.label.toLowerCase().includes('màu')

                  return (
                    <div key={group.id} className="space-y-2">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-zinc-900">
                            {`${group.label}:`}
                          </span>
                          {selectedVal && (
                            <span className="font-medium text-zinc-500">
                              (Đang chọn: {selectedVal.label})
                            </span>
                          )}
                        </div>
                        {!selectedOptions[group.id] && (
                          <span className="text-xs text-amber-700 font-semibold">
                            Chưa chọn
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                        {group.values.map((val) => {
                          const isSelected = selectedOptions[group.id] === val.id
                          const isSelectable = isValueSelectable(group.id, val.id)

                          return (
                            <button
                              key={val.id}
                              type="button"
                              disabled={!isSelectable}
                              onClick={() => handleSelectOption(group.id, val.id)}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all select-none cursor-pointer ${
                                isSelected
                                  ? 'border-zinc-950 bg-zinc-950 text-white font-bold'
                                  : isSelectable
                                  ? 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400'
                                  : 'border-zinc-100 bg-zinc-50 text-zinc-300 cursor-not-allowed line-through opacity-50'
                              }`}
                            >
                              {isColorGroup && (
                                <span
                                  className="h-3.5 w-3.5 rounded-full border border-zinc-400 shrink-0"
                                  style={{ backgroundColor: getColorCode(val.label) }}
                                />
                              )}
                              <span>{val.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Architectural Privilege Ledger */}
            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-950 text-white">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
                  ĐẶC QUYỀN ĐI KÈM TẠI AURAPHONE
                </span>
                <span className="font-mono text-[10px] text-zinc-400">VNA VIP CARE</span>
              </div>
              <div className="p-4 space-y-2.5 text-xs text-zinc-700 divide-y divide-zinc-100">
                <div className="flex items-start gap-3 pb-2">
                  <span className="font-mono text-[11px] font-bold text-emerald-700 shrink-0">01</span>
                  <span>Tặng gói bảo hành VIP 12 tháng 1 đổi 1 lỗi phần cứng từ nhà sản xuất.</span>
                </div>
                <div className="flex items-start gap-3 py-2">
                  <span className="font-mono text-[11px] font-bold text-emerald-700 shrink-0">02</span>
                  <span>Giảm trực tiếp 500.000₫ khi thanh toán qua cổng VNPay, MoMo hoặc thẻ tín dụng.</span>
                </div>
                <div className="flex items-start gap-3 py-2">
                  <span className="font-mono text-[11px] font-bold text-emerald-700 shrink-0">03</span>
                  <span>Ưu đãi 30% khi trang bị kèm củ sạc nhanh chính hãng và bao da bảo vệ.</span>
                </div>
                <div className="flex items-start gap-3 pt-2">
                  <span className="font-mono text-[11px] font-bold text-emerald-700 shrink-0">04</span>
                  <span>Trợ giá thu cũ đổi mới lên đến 2.000.000₫ thẩm định nhanh trong 15 phút.</span>
                </div>
              </div>
            </div>

            {/* Action Buttons Panel */}
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleAddToCart}
                  isLoading={isAddingToCart}
                  disabled={!isAvailable || isAddingToCart}
                  className="h-12 rounded-xl font-semibold text-sm bg-emerald-700 hover:bg-emerald-800 text-white gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>
                    {!allGroupsSelected
                      ? 'Vui lòng chọn phân loại'
                      : !isAvailable
                      ? 'Hết hàng'
                      : 'Thêm vào giỏ hàng'}
                  </span>
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleAddToCart}
                  disabled={!isAvailable || isAddingToCart}
                  className="h-12 rounded-xl font-semibold text-sm border border-zinc-200 bg-white text-zinc-900 hover:border-zinc-900 transition gap-2"
                >
                  <CreditCard className="h-4 w-4 text-zinc-700" />
                  <span>Trả góp 0% qua thẻ</span>
                </Button>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <FavoriteToggleButton
                  productId={product.id}
                  productName={product.name}
                  showText
                  className="flex-1 h-11 rounded-xl text-xs sm:text-sm font-semibold border-zinc-200 bg-white hover:bg-zinc-50"
                />
                <CompareToggleButton
                  product={product}
                  showText
                  size="default"
                  className="flex-1 h-11 rounded-xl text-xs sm:text-sm font-semibold"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 pt-1 px-1">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-emerald-700" />
                  Giao nhanh trong 2 giờ
                </span>
                <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                  Hotline tư vấn: <strong className="font-mono text-zinc-950">1800 6868</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Tabs: Specs, Highlights & Warranty Policies */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-200 pb-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('specs')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'specs'
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span>Thông số kỹ thuật</span>
            </button>
            <button
              onClick={() => setActiveTab('highlights')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'highlights'
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>Đặc điểm nổi bật</span>
            </button>
            <button
              onClick={() => setActiveTab('warranty')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'warranty'
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Chính sách bảo hành VIP</span>
            </button>
          </div>

          {activeTab === 'specs' && (
            <div className="animate-fade-in">
              {specs.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-[#f7f7f5]/60 px-6 py-10 text-center">
                  <Smartphone className="h-7 w-7 text-zinc-400 mb-2.5" />
                  <p className="text-sm font-semibold text-zinc-800">
                    Sản phẩm này chưa có thông số kỹ thuật chi tiết.
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Thông số cấu hình sẽ được cập nhật sớm từ nhà sản xuất.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {specs.map((specGroup, groupIndex) => (
                    <div
                      key={`${specGroup.group}-${groupIndex}`}
                      className="rounded-xl border border-zinc-200 bg-[#f7f7f5]/50 overflow-hidden"
                    >
                      <div className="border-b border-zinc-200 bg-zinc-950 px-4 py-2.5">
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-400">
                          {specGroup.group}
                        </h3>
                      </div>
                      <dl className="divide-y divide-zinc-200/80 bg-white">
                        {specGroup.items.map((item, itemIndex) => (
                          <div
                            key={`${item.label}-${itemIndex}`}
                            className="grid grid-cols-12 gap-3 px-4 py-3 text-xs sm:text-sm"
                          >
                            <dt className="col-span-5 font-medium text-zinc-500">
                              {item.label}
                            </dt>
                            <dd className="col-span-7 font-semibold text-zinc-950">
                              {item.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'highlights' && (
            <div className="space-y-4 text-xs sm:text-sm text-zinc-700 leading-relaxed animate-fade-in">
              {product.description ? (
                <div className="whitespace-pre-line p-5 rounded-xl bg-zinc-50 border border-zinc-200">
                  {product.description}
                </div>
              ) : (
                <p className="text-zinc-400">Đang cập nhật thông tin mô tả chi tiết sản phẩm.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                  <span className="font-mono text-[10px] text-emerald-700 font-bold">01 / CRAFTSMANSHIP</span>
                  <h4 className="font-bold text-zinc-950 text-sm">Thiết Kế Đỉnh Cao</h4>
                  <p className="text-xs text-zinc-600">
                    Vật liệu hoàn thiện cao cấp với độ bền vượt trội và cảm giác cầm nắm chuẩn xác.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                  <span className="font-mono text-[10px] text-emerald-700 font-bold">02 / OPTICS</span>
                  <h4 className="font-bold text-zinc-950 text-sm">Camera Chuyên Nghiệp</h4>
                  <p className="text-xs text-zinc-600">
                    Hệ thống cảm biến quang học thế hệ mới thu sáng vượt trội và quay phim chuẩn điện ảnh.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                  <span className="font-mono text-[10px] text-emerald-700 font-bold">03 / SILICON</span>
                  <h4 className="font-bold text-zinc-950 text-sm">Hiệu Năng Đầu Bảng</h4>
                  <p className="text-xs text-zinc-600">
                    Vi xử lý tiến trình 3nm xử lý mượt mà tác vụ đồ họa nặng và tối ưu năng lượng.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'warranty' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="p-5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
                  <h4 className="font-bold text-zinc-950 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                    Bảo hành phần cứng 12 tháng
                  </h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Bảo hành toàn diện tại tất cả trung tâm bảo hành ủy quyền chính hãng trên toàn quốc.
                  </p>
                </div>
                <div className="p-5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
                  <h4 className="font-bold text-zinc-950 flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-emerald-700" />
                    Đổi mới trong 30 ngày đầu
                  </h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Nếu phát sinh bất kỳ lỗi phần cứng nào từ nhà sản xuất, khách hàng được đổi ngay máy mới 100%.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Product Reviews Section */}
        <ProductReviewsSection
          productId={product.id}
          onSummaryLoaded={setReviewSummary}
        />
      </div>

      {/* Floating Mobile Sticky Purchase Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200 p-3 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="font-mono text-[10px] text-zinc-400 block uppercase">Giá thanh toán</span>
            <span className="font-mono text-lg font-bold text-zinc-950 tabular-nums">
              {displayedPrice}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FavoriteToggleButton
              productId={product.id}
              productName={product.name}
              size="sm"
            />
            <Button
              variant="primary"
              size="default"
              onClick={handleAddToCart}
              isLoading={isAddingToCart}
              disabled={!isAvailable || isAddingToCart}
              className="px-5 h-11 rounded-xl font-semibold text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5"
            >
              <ShoppingCart className="h-4 w-4" />
              <span>Thêm giỏ hàng</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
