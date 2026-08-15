import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Sparkles,
  Zap,
  ShieldCheck,
  Flame,
  RefreshCw,
  Clock,
  Smartphone,
  CheckCircle2,
  Percent,
  Truck,
  Repeat,
  Headphones,
} from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import type { ProductSummary, Category } from '@/api/types'
import { ProductCard } from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'

export function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<ProductSummary[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBrandTab, setSelectedBrandTab] = useState<string>('all')

  // Flash sale countdown timer simulation (hours, minutes, seconds)
  const [timeLeft, setTimeLeft] = useState({ hours: 4, minutes: 35, seconds: 28 })

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 }
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: 59, seconds: 59 }
        } else if (prev.hours > 0) {
          return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 }
        }
        return { hours: 6, minutes: 0, seconds: 0 }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [featRes, catRes] = await Promise.all([
        catalogApi.listFeaturedProducts(),
        catalogApi.listCategories(),
      ])
      setFeaturedProducts(featRes.products || [])
      setCategories(catRes.categories || [])
    } catch (err) {
      console.error(err)
      setError('Không thể tải dữ liệu sản phẩm nổi bật. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filtered products by tab
  const filteredProducts = useMemo(() => {
    if (selectedBrandTab === 'all') return featuredProducts
    if (selectedBrandTab === 'instock') return featuredProducts.filter((p) => p.inStock)
    return featuredProducts.filter(
      (p) =>
        p.brand?.id === selectedBrandTab ||
        p.category?.id === selectedBrandTab ||
        p.brand?.name?.toLowerCase().includes(selectedBrandTab.toLowerCase())
    )
  }, [featuredProducts, selectedBrandTab])

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      {/* Flagship Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 text-white py-12 lg:py-20 border-b border-slate-800">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Hero Copy */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <span>HỆ THỐNG SMARTPHONE CHÍNH HÃNG VNA</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Thế Hệ Smartphone Cao Cấp <br />
                <span className="text-emerald-400">
                  Chính Hãng & Bảo Hành VIP
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto lg:mx-0 font-normal leading-relaxed">
                Khám phá các dòng điện thoại thông minh mới nhất từ Apple iPhone 16 Series, Xiaomi 15 và các thương hiệu hàng đầu với cam kết 100% nguyên seal, bảo hành 1 đổi 1 và hỗ trợ trả góp 0% lãi suất.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2">
                <Link to="/products">
                  <Button
                    variant="primary"
                    size="lg"
                    className="gap-2 text-sm sm:text-base px-6 py-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold shadow-md shadow-emerald-600/20"
                  >
                    <span>Xem tất cả điện thoại</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/products?in_stock=true">
                  <Button
                    variant="outline"
                    size="lg"
                    className="text-white border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-white px-6 py-5 rounded-xl font-semibold"
                  >
                    Hàng có sẵn giao ngay
                  </Button>
                </Link>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-800 text-left max-w-lg mx-auto lg:mx-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                    <ShieldCheck className="h-4 w-4" />
                    <span>100% Chính hãng</span>
                  </div>
                  <p className="text-[11px] text-slate-400">VNA phân phối chính thức</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                    <Zap className="h-4 w-4" />
                    <span>Trả góp 0%</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Duyệt hồ sơ 5 phút</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                    <Truck className="h-4 w-4" />
                    <span>Giao hỏa tốc</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Miễn phí nội thành</p>
                </div>
              </div>
            </div>

            {/* Right Hero Showcase Visual Card */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-800/80 p-6 shadow-xl space-y-4">
                {/* Hot Pick Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                      Sản phẩm tâm điểm 2026
                    </span>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white">
                    Mới ra mắt
                  </span>
                </div>

                {/* Hero Phone Showcase */}
                <div className="py-2 text-center space-y-3">
                  <div className="relative mx-auto h-48 w-48 rounded-2xl bg-white flex items-center justify-center border border-slate-700/80 overflow-hidden shadow-lg group">
                    <img
                      src="/iphone-16-pro.jpg"
                      alt="iPhone 16 Pro Natural Titanium"
                      className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-950/80 text-[10px] font-bold text-white backdrop-blur-xs border border-slate-700/80">
                      Natural Titanium
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white">iPhone 16 Pro & Xiaomi 15</h3>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
                      Thiết kế Titanium siêu bền, camera cảm biến lớn và hiệu năng chip đầu bảng.
                    </p>
                  </div>

                  {/* Spec highlights */}
                  <div className="grid grid-cols-2 gap-2 pt-1 text-left">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700/60 text-[11px]">
                      <span className="text-slate-400 block text-[10px]">Màn hình</span>
                      <span className="font-bold text-white">OLED 120Hz mượt mà</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700/60 text-[11px]">
                      <span className="text-slate-400 block text-[10px]">Bảo hành</span>
                      <span className="font-bold text-emerald-400">1 Đổi 1 trong 30 ngày</span>
                    </div>
                  </div>

                  <Link to="/products" className="block pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full h-10 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/20"
                    >
                      Xem chi tiết sản phẩm
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Logos / Category Quick Navigation Bar */}
      {categories.length > 0 && (
        <section className="border-b border-slate-200/90 bg-white py-6 shadow-xs">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-emerald-600" />
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Thương hiệu smartphone chính hãng
                </h2>
              </div>
              <Link to="/products" className="text-xs font-bold text-emerald-600 hover:underline">
                Xem tất cả danh mục &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/products?category_id=${cat.id}`}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 font-bold text-slate-800 transition-all hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 hover:shadow-sm"
                >
                  <span className="text-sm">{cat.name}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
              ))}
              <Link
                to="/products?in_stock=true"
                className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-emerald-50/60 p-3.5 font-bold text-emerald-800 transition-all hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-sm"
              >
                <span className="text-sm">Hàng có sẵn</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Flash Sale Banner Section with Countdown Timer */}
      <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 p-6 sm:p-8 text-white shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-extrabold backdrop-blur-xs">
                <Flame className="h-4 w-4 text-amber-300 animate-bounce" />
                <span>GIỜ VÀNG GIÁ SỐC - CHỈ HÔM NAY</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                Flash Sale Smartphone Giảm Đến 30%
              </h2>
              <p className="text-xs sm:text-sm text-red-100 max-w-xl">
                Cơ hội sở hữu điện thoại cao cấp với mức giá ưu đãi nhất. Số lượng có hạn, áp dụng cho đơn đặt hàng trực tuyến.
              </p>
            </div>

            {/* Countdown Clock Box */}
            <div className="flex items-center gap-3 bg-slate-950/40 p-4 rounded-2xl border border-white/20 backdrop-blur-md shrink-0">
              <Clock className="h-5 w-5 text-amber-300" />
              <div className="flex items-center gap-1.5 text-center">
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-xl min-w-[36px]">
                  <span className="text-base sm:text-lg font-black tabular-nums">
                    {String(timeLeft.hours).padStart(2, '0')}
                  </span>
                  <span className="block text-[8px] text-slate-400 uppercase font-bold">Giờ</span>
                </div>
                <span className="font-bold text-lg">:</span>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-xl min-w-[36px]">
                  <span className="text-base sm:text-lg font-black tabular-nums">
                    {String(timeLeft.minutes).padStart(2, '0')}
                  </span>
                  <span className="block text-[8px] text-slate-400 uppercase font-bold">Phút</span>
                </div>
                <span className="font-bold text-lg">:</span>
                <div className="bg-slate-900 px-2.5 py-1.5 rounded-xl min-w-[36px]">
                  <span className="text-base sm:text-lg font-black tabular-nums text-amber-300">
                    {String(timeLeft.seconds).padStart(2, '0')}
                  </span>
                  <span className="block text-[8px] text-slate-400 uppercase font-bold">Giây</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products Section with Interactive Tabs */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-emerald-600 font-extrabold text-xs tracking-wider uppercase mb-1">
              <Flame className="h-4 w-4" />
              <span>Sản Phẩm Đáng Mua Nhất</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Điện Thoại Nổi Bật
            </h2>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedBrandTab('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedBrandTab === 'all'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Tất cả
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedBrandTab(cat.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  selectedBrandTab === cat.id
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat.name}
              </button>
            ))}
            <button
              onClick={() => setSelectedBrandTab('instock')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedBrandTab === 'instock'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Còn hàng
            </button>
            <Link to="/products">
              <Button variant="outline" size="sm" className="rounded-xl font-bold gap-1.5 h-9 text-xs">
                <span>Xem catalog</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
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

        {/* Error State */}
        {!isLoading && error && (
          <div className="p-8 text-center bg-white rounded-3xl border border-rose-200 shadow-sm">
            <p className="text-rose-600 text-sm font-semibold mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={loadData} className="rounded-xl font-bold">
              <RefreshCw className="h-4 w-4 mr-2" /> Thử lại
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredProducts.length === 0 && (
          <EmptyState
            icon={<Flame className="h-8 w-8 text-slate-400" />}
            title="Chưa có sản phẩm nổi bật"
            description="Hãy duyệt danh mục toàn bộ sản phẩm để tìm kiếm những chiếc điện thoại mới nhất."
            actionLabel="Khám phá ngay"
            actionLink="/products"
          />
        )}

        {/* Products Grid */}
        {!isLoading && !error && filteredProducts.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {/* Trade-in / Thu Cũ Đổi Mới Banner Section */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
            <div className="lg:col-span-8 space-y-4">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-400/30">
                <Repeat className="h-3.5 w-3.5 text-emerald-400" />
                <span>CHƯƠNG TRÌNH ĐỘC QUYỀN AURAPHONE</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight">
                Thu Cũ Đổi Mới - Trợ Giá Đến 2.000.000₫
              </h2>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
                Lên đời smartphone thế hệ mới chưa bao giờ dễ dàng hơn. Định giá minh bạch, kiểm tra máy nhanh trong 15 phút, thu mọi tình trạng máy.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Định giá cao nhất thị trường</span>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-semibold">
                  <Percent className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>Áp dụng cùng Trả góp 0%</span>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-semibold">
                  <Truck className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Thu cũ tận nơi tại nhà</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 flex justify-center lg:justify-end">
              <Link to="/products">
                <Button
                  variant="primary"
                  size="lg"
                  className="h-14 px-8 rounded-2xl font-black text-base bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/30 gap-2"
                >
                  <span>Xem chi tiết & Định giá</span>
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose AuraPhone (Cam kết & Quyền lợi khách hàng) */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-10 space-y-1.5">
          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-600">
            Dịch vụ chuẩn mực
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Vì Sao Chọn Mua Tại AuraPhone?
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Chúng tôi luôn đặt quyền lợi và sự hài lòng tuyệt đối của khách hàng lên hàng đầu.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md transition-shadow space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">Chính Hãng 100%</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tất cả điện thoại đều có nguồn gốc rõ ràng, nguyên seal VNA và bảo hành điện tử chính hãng từ nhà sản xuất.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md transition-shadow space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <Repeat className="h-6 w-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">1 Đổi 1 Trong 30 Ngày</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Nếu phát sinh lỗi phần cứng từ nhà sản xuất trong vòng 30 ngày đầu, quý khách được đổi máy mới hoàn toàn miễn phí.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md transition-shadow space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <Percent className="h-6 w-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">Trả Góp 0% Lãi Suất</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Hỗ trợ trả góp lãi suất 0% qua thẻ tín dụng hơn 25 ngân hàng hoặc duyệt hồ sơ online cực nhanh chỉ với CCCD.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xs hover:shadow-md transition-shadow space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <Headphones className="h-6 w-6" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">Hỗ Trợ Kỹ Thuật 24/7</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Đội ngũ chuyên viên kỹ thuật sẵn sàng hỗ trợ cài đặt dữ liệu, dán màn hình miễn phí và tư vấn sử dụng trọn đời.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
