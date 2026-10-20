import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center px-4 text-center bg-[#f7f7f5]">
      <span className="font-mono text-7xl font-bold tracking-tight text-zinc-200">404</span>
      <h1 className="text-2xl font-bold text-zinc-950 mt-2">Trang không tồn tại</h1>
      <p className="text-sm text-zinc-500 mt-2 max-w-sm leading-relaxed">
        Địa chỉ bạn truy cập không tồn tại hoặc đã được chuyển sang đường dẫn khác.
      </p>
      <div className="flex gap-3 mt-8">
        <Link to="/">
          <Button variant="default" className="gap-2 rounded-xl">
            <Home className="h-4 w-4" /> Về trang chủ
          </Button>
        </Link>
        <Link to="/products">
          <Button variant="outline" className="gap-2 rounded-xl">
            <ArrowLeft className="h-4 w-4" /> Xem sản phẩm
          </Button>
        </Link>
      </div>
    </div>
  )
}
