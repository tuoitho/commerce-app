import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  Clock,
  Smartphone,
  CheckCircle2,
} from 'lucide-react'
import { catalogApi } from '@/api/catalog'
import type { ProductSummary, Category } from '@/api/types'
import { ProductCard } from '@/components/ProductCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { LiveBanner } from '@/components/live/LiveBanner'
import { useCurrentLive } from '@/hooks/useCurrentLive'

export function HomePage() {
  const [featuredProducts, setFeaturedProducts] = useState<ProductSummary[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBrandTab, setSelectedBrandTab] = useState<string>('all')
  const currentLive = useCurrentLive()

  // Privilege allocation countdown timer
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
      setFeaturedProducts(featRes || [])
      setCategories(catRes || [])
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

  const filteredProducts = useMemo(() => {
    if (selectedBrandTab === 'all') return featuredProducts
    if (selectedBrandTab === 'instock') return featuredProducts.filter((p) => p.inStock)
    return featuredProducts.filter(
      (p) =>
        p.category?.id === selectedBrandTab ||
        p.brand?.toLowerCase().includes(selectedBrandTab.toLowerCase())
    )
  }, [featuredProducts, selectedBrandTab])

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-24">
      {/* Architectural Editorial Flagship Hero */}
      <section className="relative overflow-hidden bg-zinc-950 text-white border-b border-zinc-900">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Hero Column: Strictly capped to 4 editorial elements */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>01 / FLAGSHIP STUDIO 2026 - VNA AUTHORIZED</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight text-white leading-[1.06]">
                Kiến Trúc Công Nghệ. <br />
                <span className="text-zinc-400">Chuẩn Mực Flagship Chính Hãng.</span>
              </h1>

              <p className="text-sm sm:text-base text-zinc-400 max-w-xl leading-relaxed">
                Tuyển chọn thiết bị di động đầu bảng từ Apple và Xiaomi. Nguyên bản nhà sản xuất VNA, bảo hành 1 đổi 1 và trả góp 0% lãi suất.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link to="/products">
                  <Button
                    variant="primary"
                    size="lg"
                    className="gap-2 text-sm px-6 h-12 rounded-xl bg-emerald-700 hover:bg-emerald-600 font-semibold text-white"
                  >
                    <span>Xem tất cả điện thoại</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/products?in_stock=true">
                  <Button
                    variant="outline"
                    size="lg"
                    className="text-zinc-200 border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 hover:text-white px-6 h-12 rounded-xl font-semibold text-sm"
                  >
                    Hàng có sẵn giao ngay
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right Hero Column: Clean Architectural Exhibition Pedestal */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-7">
                <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-800">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block">
                      EXHIBITION EDITION
                    </span>
                    <h2 className="text-base font-bold text-white mt-0.5">
                      iPhone 16 Pro & Xiaomi 15 Ultra
                    </h2>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                    Sẵn hàng VNA
                  </span>
                </div>

                {/* Unobstructed Studio Product Frame */}
                <Link
                  to="/products"
                  className="group block rounded-xl bg-[#f7f7f5] p-6 border border-zinc-800/40"
                >
                  <div className="flex h-52 w-full items-center justify-center">
                    <img
                      src="/iphone-16-pro.jpg"
                      alt="iPhone 16 Pro Natural Titanium"
                      className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                </Link>

                {/* Architectural Spec Ledger */}
                <div className="grid grid-cols-3 divide-x divide-zinc-800 border-t border-zinc-800 mt-5 pt-4 text-left">
                  <div className="pr-3">
                    <span className="font-mono text-[10px] uppercase text-zinc-500 block">
                      CHẤT LIỆU
                    </span>
                    <span className="text-xs font-semibold text-zinc-200 mt-0.5 block">
                      Titanium Grade 5
                    </span>
                  </div>
                  <div className="px-3">
                    <span className="font-mono text-[10px] uppercase text-zinc-500 block">
                      THẤU KÍNH
                    </span>
                    <span className="text-xs font-semibold text-zinc-200 mt-0.5 block">
                      48MP ProRAW / Leica
                    </span>
                  </div>
                  <div className="pl-3">
                    <span className="font-mono text-[10px] uppercase text-zinc-500 block">
                      ĐẶC QUYỀN
                    </span>
                    <span className="text-xs font-semibold text-emerald-400 mt-0.5 block">
                      1 Đổi 1 30 Ngày
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {currentLive && <LiveBanner live={currentLive} />}

      {/* Architectural Telemetry & Guarantee Bar */}
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200">
            <div className="py-5 pr-4">
              <span className="font-mono text-xl sm:text-2xl font-bold text-zinc-950 tabular-nums block">
                100% VNA
              </span>
              <span className="text-xs text-zinc-500 mt-0.5 block">
                Nguyên seal chính hãng phân phối tại Việt Nam
              </span>
            </div>
            <div className="py-5 sm:px-6">
              <span className="font-mono text-xl sm:text-2xl font-bold text-zinc-950 tabular-nums block">
                0% APR
              </span>
              <span className="text-xs text-zinc-500 mt-0.5 block">
                Trả góp kỳ hạn linh hoạt 6 - 12 tháng
              </span>
            </div>
            <div className="py-5 sm:px-6">
              <span className="font-mono text-xl sm:text-2xl font-bold text-zinc-950 tabular-nums block">
                30 NGÀY
              </span>
              <span className="text-xs text-zinc-500 mt-0.5 block">
                Bảo hành 1 đổi 1 máy mới nguyên hộp
              </span>
            </div>
            <div className="py-5 sm:pl-6">
              <span className="font-mono text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums block">
                2 GIỜ
              </span>
              <span className="text-xs text-zinc-500 mt-0.5 block">
                Giao hàng hỏa tốc nội thành Hà Nội & TP.HCM
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Category Index Bar */}
      {categories.length > 0 && (
        <section className="border-b border-zinc-200 bg-[#f7f7f5] py-7">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-zinc-900 tracking-tight">
                Danh Mục Hệ Sinh Thái Chính Hãng
              </h2>
              <Link
                to="/products"
                className="text-xs font-semibold text-zinc-700 hover:text-zinc-950 flex items-center gap-1"
              >
                <span>Xem toàn bộ danh mục</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {categories.map((cat, idx) => (
                <Link
                  key={cat.id}
                  to={`/products?category_id=${cat.id}`}
                  className="group flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-3.5 transition-all hover:border-zinc-900"
                >
                  <div>
                    <span className="font-mono text-[10px] text-zinc-400 block">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-bold text-zinc-900 group-hover:text-emerald-700 transition-colors">
                      {cat.name}
                    </span>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-950 transition-colors" />
                </Link>
              ))}
              <Link
                to="/products?in_stock=true"
                className="group flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 transition-all hover:border-emerald-700"
              >
                <div>
                  <span className="font-mono text-[10px] text-emerald-700 block">READY</span>
                  <span className="text-sm font-bold text-emerald-950">Hàng có sẵn</span>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Featured Products Section with Interactive Tabs */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4 border-b border-zinc-200 pb-5">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950">
              Điện Thoại Nổi Bật
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1">
              Các cấu hình flagship được lựa chọn nhiều nhất tại hệ thống AuraPhone
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedBrandTab('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                selectedBrandTab === 'all'
                  ? 'bg-zinc-950 text-white'
                  : 'bg-white text-zinc-700 border border-zinc-200 hover:border-zinc-400'
              }`}
            >
              Tất cả
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedBrandTab(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedBrandTab === cat.id
                    ? 'bg-zinc-950 text-white'
                    : 'bg-white text-zinc-700 border border-zinc-200 hover:border-zinc-400'
                }`}
              >
                {cat.name}
              </button>
            ))}
            <button
              onClick={() => setSelectedBrandTab('instock')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                selectedBrandTab === 'instock'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white text-zinc-700 border border-zinc-200 hover:border-zinc-400'
              }`}
            >
              Còn hàng
            </button>
            <Link to="/products">
              <Button variant="outline" size="sm" className="rounded-xl font-semibold gap-1.5 h-8 text-xs">
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
              <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <Skeleton className="h-5 w-20 rounded-md" />
                <Skeleton className="h-48 w-full rounded-xl" />
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
          <div className="p-8 text-center bg-white rounded-2xl border border-rose-200">
            <p className="text-rose-600 text-sm font-semibold mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={loadData} className="rounded-xl font-semibold">
              <RefreshCw className="h-4 w-4 mr-2" /> Thử lại
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredProducts.length === 0 && (
          <EmptyState
            icon={<Smartphone className="h-7 w-7 text-zinc-500" />}
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

      {/* Asymmetric 2-Panel Bento: Privilege Allocation & Trade-In Program */}
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel (7 cols): Trade-In / Thu Cũ Đổi Mới */}
          <div className="lg:col-span-7 rounded-2xl bg-zinc-950 text-white p-8 sm:p-10 border border-zinc-800 flex flex-col justify-between">
            <div className="space-y-4">
              <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400 block">
                02 / TRADE-IN PRIVILEGE
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Thu Cũ Đổi Mới - Trợ Giá Đến 2.000.000₫
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed max-w-xl">
                Nâng cấp lên thế hệ flagship mới nhất với quy trình thẩm định minh bạch trong 15 phút. Hỗ trợ thu máy tận nơi và kết hợp đồng thời cùng gói trả góp 0% lãi suất.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-6 text-xs text-zinc-300">
                <div>
                  <span className="font-mono text-white font-bold block">15 PHÚT</span>
                  <span className="text-zinc-500">Thẩm định nhanh</span>
                </div>
                <div className="h-6 w-px bg-zinc-800" />
                <div>
                  <span className="font-mono text-white font-bold block">0% APR</span>
                  <span className="text-zinc-500">Cộng dồn ưu đãi</span>
                </div>
              </div>

              <Link to="/products">
                <Button
                  variant="primary"
                  className="rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs px-5 h-10 gap-1.5"
                >
                  <span>Xem chi tiết & Định giá</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Panel (5 cols): Limited Allocation Countdown */}
          <div className="lg:col-span-5 rounded-2xl bg-white border border-zinc-200 p-8 sm:p-10 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                  SUẤT ĐẶC QUYỀN TRONG NGÀY
                </span>
                <Clock className="h-4 w-4 text-emerald-700" />
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950">
                Ưu Đãi Đặt Trước Trực Tuyến
              </h3>
              <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed">
                Giá đặc quyền áp dụng cho các đơn hàng thanh toán hoặc đăng ký giữ máy trực tuyến trong khung giờ phiên hiện tại.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-zinc-100">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-zinc-950 text-white py-3 px-2">
                  <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums block">
                    {String(timeLeft.hours).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 mt-0.5 block">
                    Giờ
                  </span>
                </div>
                <div className="rounded-xl bg-zinc-950 text-white py-3 px-2">
                  <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums block">
                    {String(timeLeft.minutes).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 mt-0.5 block">
                    Phút
                  </span>
                </div>
                <div className="rounded-xl bg-zinc-950 text-emerald-400 py-3 px-2">
                  <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums block">
                    {String(timeLeft.seconds).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 mt-0.5 block">
                    Giây
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architectural Editorial Split: Service Standards */}
      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight">
              Vì Sao Chọn Mua Tại AuraPhone?
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed">
              Mọi thiết bị bán ra đều tuân thủ quy chuẩn kiểm định phần cứng và cam kết hậu mãi minh bạch suốt vòng đời sử dụng.
            </p>
          </div>

          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            <div className="divide-y divide-zinc-200">
              <div className="p-6 space-y-2">
                <span className="font-mono text-xs font-bold text-emerald-700">01</span>
                <h3 className="font-bold text-zinc-950 text-base">Chính Hãng 100%</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Tất cả thiết bị đều có nguồn gốc rõ ràng, nguyên seal VNA và bảo hành điện tử chính hãng từ nhà sản xuất.
                </p>
              </div>
              <div className="p-6 space-y-2">
                <span className="font-mono text-xs font-bold text-emerald-700">02</span>
                <h3 className="font-bold text-zinc-950 text-base">1 Đổi 1 Trong 30 Ngày</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Nếu phát sinh lỗi phần cứng từ nhà sản xuất trong 30 ngày đầu, quý khách được đổi máy mới nguyên hộp miễn phí.
                </p>
              </div>
            </div>

            <div className="divide-y divide-zinc-200">
              <div className="p-6 space-y-2">
                <span className="font-mono text-xs font-bold text-emerald-700">03</span>
                <h3 className="font-bold text-zinc-950 text-base">Trả Góp 0% Lãi Suất</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Hỗ trợ trả góp 0% qua thẻ tín dụng hơn 25 ngân hàng hoặc duyệt hồ sơ trực tuyến nhanh chóng trong 5 phút.
                </p>
              </div>
              <div className="p-6 space-y-2">
                <span className="font-mono text-xs font-bold text-emerald-700">04</span>
                <h3 className="font-bold text-zinc-950 text-base">Hỗ Trợ Kỹ Thuật Trọn Đời</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Đội ngũ kỹ thuật viên chuyên sâu hỗ trợ chuyển dữ liệu bảo mật, vệ sinh máy và tư vấn phần mềm trọn đời.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
