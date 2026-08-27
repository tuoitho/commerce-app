import { Link } from 'react-router-dom'
import { Smartphone, ShieldCheck, Truck, RotateCcw, MapPin } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-slate-200/90 bg-white text-slate-600">
      {/* Service Highlights Ribbon */}
      <div className="border-b border-slate-100 bg-slate-50/70 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Chính Hãng 100%</h4>
                <p className="text-xs text-slate-500 mt-0.5">Bảo hành 12-24 tháng toàn diện từ nhà sản xuất</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shrink-0">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">Giao Hàng Siêu Tốc 2H</h4>
                <p className="text-xs text-slate-500 mt-0.5">Miễn phí vận chuyển toàn quốc cho mọi đơn hàng</p>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200/70 shadow-xs">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shrink-0">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-sm">1 Đổi 1 Trong 30 Ngày</h4>
                <p className="text-xs text-slate-500 mt-0.5">Đổi mới miễn phí ngay lập tức nếu có lỗi NSX</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand Info */}
          <div className="space-y-4 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 font-extrabold text-xl text-slate-900">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <Smartphone className="h-5 w-5 text-emerald-400" />
              </div>
              <span>AuraPhone</span>
            </Link>
            <p className="text-xs text-slate-500 leading-relaxed">
              Hệ thống bán lẻ điện thoại di động thông minh chính hãng Apple, Xiaomi, Samsung hàng đầu Việt Nam. Cam kết chất lượng và dịch vụ tận tâm.
            </p>
            <div className="space-y-1.5 pt-1 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Hà Nội: 123 Thái Hà, Đống Đa</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>TP. HCM: 456 Nguyễn Thị Minh Khai, Q.3</span>
              </div>
            </div>
          </div>

          {/* Products */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-3">Sản phẩm & Thương hiệu</h4>
            <ul className="space-y-2 text-xs font-medium">
              <li>
                <Link to="/products" className="hover:text-emerald-600 transition">Tất cả sản phẩm</Link>
              </li>
              <li>
                <Link to="/products?category_id=10000000-0000-0000-0000-000000000001" className="hover:text-emerald-600 transition">Điện thoại</Link>
              </li>
              <li>
                <Link to="/products?category_id=10000000-0000-0000-0000-000000000002" className="hover:text-emerald-600 transition">Máy tính & Laptop</Link>
              </li>
              <li>
                <Link to="/products?category_id=10000000-0000-0000-0000-000000000004" className="hover:text-emerald-600 transition">Tai nghe</Link>
              </li>
              <li>
                <Link to="/products?category_id=10000000-0000-0000-0000-000000000005" className="hover:text-emerald-600 transition">Đồng hồ thông minh</Link>
              </li>
            </ul>
          </div>

          {/* Policies & Services */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-3">Chính sách & Dịch vụ</h4>
            <ul className="space-y-2 text-xs font-medium">
              <li>
                <Link to="/cart" className="hover:text-emerald-600 transition">Giỏ hàng của bạn</Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-emerald-600 transition">Đăng nhập tài khoản</Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-emerald-600 transition">Đăng ký thành viên mới</Link>
              </li>
              <li>
                <span className="text-slate-500">Chính sách bảo hành 1 đổi 1</span>
              </li>
              <li>
                <span className="text-slate-500">Chính sách trả góp 0%</span>
              </li>
            </ul>
          </div>

          {/* Customer Support & Payment methods */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-3">Tổng đài hỗ trợ (Miễn phí)</h4>
              <p className="text-xs text-slate-600 leading-relaxed space-y-1.5">
                <span className="block">
                  Tư vấn mua hàng: <a href="tel:18006868" className="font-extrabold text-emerald-600 hover:underline">1800 6868</a> (8h00 - 21h30)
                </span>
                <span className="block">
                  Hỗ trợ kỹ thuật: <a href="tel:18006869" className="font-extrabold text-slate-800 hover:underline">1800 6869</a>
                </span>
                <span className="block">
                  Email: <strong className="text-slate-800">support@auraphone.vn</strong>
                </span>
              </p>
            </div>

            <div>
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Phương thức thanh toán</h5>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-slate-100 rounded-md text-[10px] font-bold text-slate-700">Visa / Master</span>
                <span className="px-2 py-1 bg-slate-100 rounded-md text-[10px] font-bold text-slate-700">VNPay</span>
                <span className="px-2 py-1 bg-slate-100 rounded-md text-[10px] font-bold text-slate-700">MoMo</span>
                <span className="px-2 py-1 bg-slate-100 rounded-md text-[10px] font-bold text-slate-700">Trả góp 0%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
          <div>
            © {new Date().getFullYear()} AuraPhone Inc. Hệ thống bán lẻ Smartphone chính hãng. Mọi quyền được bảo lưu.
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
