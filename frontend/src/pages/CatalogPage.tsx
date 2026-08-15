import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Search, SlidersHorizontal, RefreshCw, X, PackageSearch, Smartphone, ChevronRight, Zap } from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import type { ProductSummary, Category } from '@/api/types'
import { ProductCard } from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/EmptyState'

const PRICE_PRESETS = [
  { label: 'Dưới 5 triệu', min: '', max: '5000000' },
  { label: '5 - 10 triệu', min: '5000000', max: '10000000' },
  { label: '10 - 20 triệu', min: '10000000', max: '20000000' },
  { label: 'Trên 20 triệu', min: '20000000', max: '' },
]

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [products, setProducts] = useState<ProductSummary[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc'>('default')

  // Query state derived from URL
  const querySearch = searchParams.get('q') || ''
  const selectedCategoryIds = useMemo(() => searchParams.getAll('category_id'), [searchParams])
  const queryMinPrice = searchParams.get('min_price') || ''
  const queryMaxPrice = searchParams.get('max_price') || ''
  const queryInStock = searchParams.get('in_stock') === 'true'

  // Local inputs
  const [searchInput, setSearchInput] = useState(querySearch)
  const [minPriceInput, setMinPriceInput] = useState(queryMinPrice)
  const [maxPriceInput, setMaxPriceInput] = useState(queryMaxPrice)

  // Keep local search input synced when URL changes externally
  useEffect(() => {
    setSearchInput(querySearch)
  }, [querySearch])

  useEffect(() => {
    setMinPriceInput(queryMinPrice)
  }, [queryMinPrice])

  useEffect(() => {
    setMaxPriceInput(queryMaxPrice)
  }, [queryMaxPrice])

  // Load Categories on mount
  useEffect(() => {
    catalogApi
      .listCategories()
      .then((res) => setCategories(res.categories || []))
      .catch((err) => console.error('Failed to load categories', err))
  }, [])

  // Fetch Products based on URL query
  const fetchProducts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await catalogApi.listProducts({
        q: querySearch || undefined,
        category_id: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
        min_price: queryMinPrice || undefined,
        max_price: queryMaxPrice || undefined,
        in_stock: queryInStock ? 'true' : undefined,
      })
      setProducts(res.products || [])
    } catch (err: unknown) {
      console.error(err)
      setError('Không thể tải danh sách sản phẩm. Vui lòng kiểm tra lại bộ lọc.')
    } finally {
      setIsLoading(false)
    }
  }, [querySearch, selectedCategoryIds, queryMinPrice, queryMaxPrice, queryInStock])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Handlers to update URL search params
  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    const newParams = new URLSearchParams(searchParams)
    if (searchInput.trim()) {
      newParams.set('q', searchInput.trim())
    } else {
      newParams.delete('q')
    }
    setSearchParams(newParams)
  }

  const handleCategoryToggle = (catId: string) => {
    const newParams = new URLSearchParams(searchParams)
    const currentCats = newParams.getAll('category_id')
    newParams.delete('category_id')

    if (currentCats.includes(catId)) {
      currentCats.filter((id) => id !== catId).forEach((id) => newParams.append('category_id', id))
    } else {
      [...currentCats, catId].forEach((id) => newParams.append('category_id', id))
    }
    setSearchParams(newParams)
  }

  const handleInStockToggle = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams)
    if (checked) {
      newParams.set('in_stock', 'true')
    } else {
      newParams.delete('in_stock')
    }
    setSearchParams(newParams)
  }

  const handlePricePreset = (min: string, max: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (min) {
      newParams.set('min_price', min)
    } else {
      newParams.delete('min_price')
    }
    if (max) {
      newParams.set('max_price', max)
    } else {
      newParams.delete('max_price')
    }
    setSearchParams(newParams)
  }

  const handlePriceApply = (e: FormEvent) => {
    e.preventDefault()
    const newParams = new URLSearchParams(searchParams)
    
    // Validate canonical integers
    const cleanMin = minPriceInput.trim().replace(/\D/g, '')
    const cleanMax = maxPriceInput.trim().replace(/\D/g, '')

    if (cleanMin) {
      newParams.set('min_price', cleanMin)
    } else {
      newParams.delete('min_price')
    }

    if (cleanMax) {
      newParams.set('max_price', cleanMax)
    } else {
      newParams.delete('max_price')
    }

    setSearchParams(newParams)
  }

  const handleClearFilters = () => {
    setSearchInput('')
    setMinPriceInput('')
    setMaxPriceInput('')
    setSearchParams(new URLSearchParams())
  }

  const hasActiveFilters =
    Boolean(querySearch) ||
    selectedCategoryIds.length > 0 ||
    Boolean(queryMinPrice) ||
    Boolean(queryMaxPrice) ||
    queryInStock

  // Sorted product list
  const sortedProducts = useMemo(() => {
    const list = [...products]
    if (sortBy === 'price-asc') {
      list.sort((a, b) => Number(a.minPriceVnd || a.price || 0) - Number(b.minPriceVnd || b.price || 0))
    } else if (sortBy === 'price-desc') {
      list.sort((a, b) => Number(b.minPriceVnd || b.price || 0) - Number(a.minPriceVnd || a.price || 0))
    }
    return list
  }, [products, sortBy])

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      {/* Breadcrumb & Header Banner */}
      <div className="border-b border-slate-200/90 bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-3">
            <Link to="/" className="hover:text-emerald-600">Trang chủ</Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-900">Danh mục điện thoại</span>
          </nav>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                Danh Mục Điện Thoại
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Lựa chọn smartphone chính hãng VNA từ Apple iPhone, Xiaomi với nhiều phân khúc giá và ưu đãi trả góp 0%.
              </p>
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-md w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Tìm theo tên hoặc model điện thoại..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-10 h-11 rounded-2xl bg-slate-50 border-slate-200 text-xs"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('')
                      const newParams = new URLSearchParams(searchParams)
                      newParams.delete('q')
                      setSearchParams(newParams)
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button type="submit" variant="default" size="default" className="h-11 px-5 rounded-2xl font-bold text-xs bg-slate-900 hover:bg-emerald-600">
                Tìm kiếm
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Mobile Filter Toggle & Results Count */}
        <div className="lg:hidden flex items-center justify-between gap-4 mb-6">
          <div className="text-sm font-bold text-slate-700">
            {isLoading ? 'Đang tải...' : `${products.length} sản phẩm`}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="gap-2 rounded-xl font-bold"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Bộ lọc {hasActiveFilters ? '(Đang lọc)' : ''}</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Filters (Desktop & Mobile Drawer) */}
          <aside
            className={`lg:block ${
              showMobileFilters
                ? 'block fixed inset-0 z-50 bg-white p-6 overflow-y-auto'
                : 'hidden'
            } space-y-6`}
          >
            {/* Mobile drawer header */}
            {showMobileFilters && (
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 lg:hidden">
                <h3 className="font-extrabold text-lg text-slate-900">Bộ Lọc Tìm Kiếm</h3>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            )}

            {/* Filter Section: Categories / Brands */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  <span>Thương hiệu</span>
                </h3>
                {selectedCategoryIds.length > 0 && (
                  <button
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams)
                      newParams.delete('category_id')
                      setSearchParams(newParams)
                    }}
                    className="text-xs font-bold text-emerald-600 hover:underline"
                  >
                    Bỏ chọn
                  </button>
                )}
              </div>

              <div className="space-y-1">
                {categories.map((cat) => {
                  const isChecked = selectedCategoryIds.includes(cat.id)
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition select-none"
                    >
                      <label htmlFor={`cat-${cat.id}`} className="text-sm font-semibold text-slate-700 cursor-pointer flex-1">
                        {cat.name}
                      </label>
                      <Checkbox
                        id={`cat-${cat.id}`}
                        checked={isChecked}
                        onCheckedChange={() => handleCategoryToggle(cat.id)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Filter Section: In Stock */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between select-none">
                <label htmlFor="filter-in-stock" className="cursor-pointer">
                  <span className="text-sm font-extrabold text-slate-900 block">Chỉ còn hàng</span>
                  <span className="text-xs text-slate-400">Ẩn các sản phẩm tạm hết</span>
                </label>
                <Checkbox
                  id="filter-in-stock"
                  checked={queryInStock}
                  onCheckedChange={(checked) => handleInStockToggle(checked)}
                />
              </div>
            </div>

            {/* Filter Section: Price Presets & Custom Range */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-500" />
                <span>Mức giá</span>
              </h3>

              {/* Price bracket chips */}
              <div className="grid grid-cols-2 gap-2">
                {PRICE_PRESETS.map((p, i) => {
                  const isSelected = queryMinPrice === p.min && queryMaxPrice === p.max
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handlePricePreset(p.min, p.max)}
                      className={`p-2 rounded-xl text-xs font-bold border transition ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>

              {/* Custom price input */}
              <form onSubmit={handlePriceApply} className="space-y-3 pt-2 border-t border-slate-100">
                <div className="text-[11px] font-bold text-slate-500">Hoặc nhập khoảng giá (VND):</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Từ</label>
                    <Input
                      type="text"
                      placeholder="0"
                      value={minPriceInput}
                      onChange={(e) => setMinPriceInput(e.target.value)}
                      className="h-8 text-xs rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Đến</label>
                    <Input
                      type="text"
                      placeholder="VD: 30000000"
                      value={maxPriceInput}
                      onChange={(e) => setMaxPriceInput(e.target.value)}
                      className="h-8 text-xs rounded-xl"
                    />
                  </div>
                </div>
                <Button type="submit" variant="outline" size="sm" className="w-full text-xs font-bold rounded-xl h-9">
                  Áp dụng khoảng giá
                </Button>
              </form>
            </div>

            {/* Reset All Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-2xl font-bold"
              >
                <X className="h-4 w-4 mr-2" /> Xoá toàn bộ bộ lọc
              </Button>
            )}

            {/* Close Drawer for Mobile */}
            {showMobileFilters && (
              <Button
                variant="primary"
                size="lg"
                className="w-full rounded-2xl lg:hidden mt-6 font-bold bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setShowMobileFilters(false)}
              >
                Xem kết quả ({products.length})
              </Button>
            )}
          </aside>

          {/* Product Grid Area */}
          <main className="lg:col-span-3 space-y-6">
            {/* Desktop Results Header & Sort Bar */}
            <div className="hidden lg:flex items-center justify-between pb-2">
              <span className="text-sm font-bold text-slate-700">
                {isLoading ? 'Đang tìm kiếm...' : `Hiển thị ${products.length} sản phẩm`}
              </span>

              {/* Sorting Bar */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Sắp xếp:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  aria-label="Sắp xếp theo"
                  className="h-9 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 outline-none focus:border-emerald-500 shadow-xs"
                >
                  <option value="default">Nổi bật nhất</option>
                  <option value="price-asc">Giá: Thấp đến Cao</option>
                  <option value="price-desc">Giá: Cao đến Thấp</option>
                </select>
                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="text-xs font-bold text-emerald-600 hover:underline ml-3"
                  >
                    Xoá bộ lọc
                  </button>
                )}
              </div>
            </div>

            {/* Loading Skeleton Grid */}
            {isLoading && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
                    <Skeleton className="h-6 w-20 rounded-md" />
                    <Skeleton className="h-48 w-full rounded-2xl" />
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex justify-between items-center pt-2">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-8 w-16 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error Message */}
            {!isLoading && error && (
              <div className="p-10 text-center bg-white rounded-3xl border border-rose-200 shadow-sm space-y-4">
                <p className="text-rose-600 text-sm font-semibold">{error}</p>
                <div className="flex justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={fetchProducts} className="rounded-xl font-bold">
                    <RefreshCw className="h-4 w-4 mr-2" /> Thử lại
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClearFilters} className="rounded-xl font-bold">
                    Xoá bộ lọc
                  </Button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && products.length === 0 && (
              <EmptyState
                icon={<PackageSearch className="h-8 w-8 text-slate-400" />}
                title="Không tìm thấy sản phẩm"
                description="Không có thiết bị nào phù hợp với tiêu chí tìm kiếm hoặc bộ lọc hiện tại của bạn."
                actionLabel="Xoá toàn bộ tiêu chí"
                onAction={handleClearFilters}
              />
            )}

            {/* Products List */}
            {!isLoading && !error && sortedProducts.length > 0 && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {sortedProducts.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
