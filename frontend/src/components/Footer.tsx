import { Link } from 'react-router-dom'
import { Smartphone, ShieldCheck, Truck, RotateCcw, MapPin } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-zinc-900 bg-zinc-950 text-zinc-400">
      {/* Architectural Service Ledger Ribbon */}
      <div className="border-b border-zinc-800/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 divide-y divide-zinc-800/80 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
            <div className="flex items-start gap-4 py-6 sm:pr-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-emerald-400 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block">
                  01 / AUTHENTICITY
                </span>
                <h4 className="font-bold text-white text-sm mt-0.5">Chính Hãng 100% VNA</h4>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Bảo hành điện tử 12-24 tháng toàn diện tại trung tâm ủy quyền
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 py-6 sm:px-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-emerald-400 shrink-0">
                <Truck className="h-5 w-5" />
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block">
                  02 / LOGISTICS
                </span>
                <h4 className="font-bold text-white text-sm mt-0.5">Giao Hàng Đặc Quyền 2H</h4>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Miễn phí vận chuyển bảo hiểm toàn trình cho mọi đơn hàng
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 py-6 sm:pl-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-emerald-400 shrink-0">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 block">
                  03 / PROTECTION
                </span>
                <h4 className="font-bold text-white text-sm mt-0.5">1 Đổi 1 Trong 30 Ngày</h4>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Đổi mới nguyên seal ngay lập tức nếu phát sinh lỗi từ NSX
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Architecture */}
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand Column */}
          <div className="space-y-4 md:col-span-4">
            <Link to="/" className="flex items-center gap-3 font-extrabold text-xl text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400">
                <Smartphone className="h-5 w-5" />
              </div>
              <span className="tracking-tight">AuraPhone</span>
            </Link>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              Không gian trải nghiệm và phân phối thiết bị di động flagship chính hãng Apple, Xiaomi, Samsung. Chế tác dịch vụ chuẩn mực dành riêng cho khách hàng yêu công nghệ.
            </p>
            <div className="space-y-2 pt-2 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>Hà Nội: 123 Thái Hà, Quận Đống Đa</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>TP. HCM: 456 Nguyễn Thị Minh Khai, Quận 3</span>
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="md:col-span-3">
            <h4 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-200 mb-4">
              Danh mục thiết bị
            </h4>
            <ul className="space-y-2.5 text-xs font-medium">
              <li>
                <Link to="/products" className="hover:text-white transition-colors">
                  Tất cả điện thoại
                </Link>
              </li>
              <li>
                <Link
                  to="/products?category_id=10000000-0000-0000-0000-000000000001"
                  className="hover:text-white transition-colors"
                >
                  Apple iPhone Series
                </Link>
              </li>
              <li>
                <Link
                  to="/products?category_id=10000000-0000-0000-0000-000000000002"
                  className="hover:text-white transition-colors"
                >
                  Xiaomi Flagship Series
                </Link>
              </li>
              <li>
                <Link to="/products?in_stock=true" className="hover:text-white transition-colors">
                  Hàng có sẵn giao ngay
                </Link>
              </li>
            </ul>
          </div>

          {/* Policies & Services */}
          <div className="md:col-span-2">
            <h4 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-200 mb-4">
              Khách hàng
            </h4>
            <ul className="space-y-2.5 text-xs font-medium">
              <li>
                <Link to="/cart" className="hover:text-white transition-colors">
                  Giỏ hàng của bạn
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  Đăng nhập tài khoản
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white transition-colors">
                  Đăng ký thành viên
                </Link>
              </li>
              <li>
                <span className="text-zinc-500">Bảo hành 1 đổi 1</span>
              </li>
              <li>
                <span className="text-zinc-500">Đặc quyền trả góp 0%</span>
              </li>
            </ul>
          </div>

          {/* Customer Support & Payment methods */}
          <div className="space-y-5 md:col-span-3">
            <div>
              <h4 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-zinc-200 mb-4">
                Tổng đài chuyên viên
              </h4>
              <div className="text-xs text-zinc-400 space-y-2">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                  <span>Tư vấn (8h00 - 21h30)</span>
                  <a
                    href="tel:18006868"
                    className="font-mono font-bold text-emerald-400 hover:underline"
                  >
                    1800 6868
                  </a>
                </div>
                <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5">
                  <span>Kỹ thuật & Bảo hành</span>
                  <a
                    href="tel:18006869"
                    className="font-mono font-bold text-white hover:underline"
                  >
                    1800 6869
                  </a>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span>Hỗ trợ doanh nghiệp</span>
                  <span className="font-mono text-zinc-200">support@auraphone.vn</span>
                </div>
              </div>
            </div>

            <div>
              <h5 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                Đối tác thanh toán
              </h5>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-md font-mono text-[10px] text-zinc-300">
                  VISA / MASTER
                </span>
                <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-md font-mono text-[10px] text-zinc-300">
                  VNPAY
                </span>
                <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-md font-mono text-[10px] text-zinc-300">
                  MOMO
                </span>
                <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-md font-mono text-[10px] text-zinc-300">
                  0% INSTALLMENT
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-zinc-900 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
          <div>
            © {new Date().getFullYear()} AuraPhone Studio. Hệ thống phân phối Smartphone chính hãng.
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Điều khoản sử dụng</span>
            <span>•</span>
            <span>Chính sách bảo mật</span>
            <span>•</span>
            <span>Quy chế hoạt động</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
