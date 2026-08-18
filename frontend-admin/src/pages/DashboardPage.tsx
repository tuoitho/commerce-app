import { useState } from 'react'
import { Activity, Server, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function DashboardPage() {
  const [refreshedCount, setRefreshedCount] = useState(0)

  const handleRefresh = () => {
    setRefreshedCount((prev) => prev + 1)
  }

  return (
    <div className="space-y-6">
      {/* Quick Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Thống kê nhanh</CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">Sẵn sàng</div>
            <p className="text-xs text-slate-500 mt-1">Đã kết nối giao diện quản trị thành công</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Hệ thống</CardTitle>
            <Server className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-900">Hoạt động</span>
              <Badge variant="success" className="text-xs">
                Online
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">Vite + React 19 + Tailwind v4</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Tương tác</CardTitle>
            <RefreshCw className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {refreshedCount > 0 ? `Đã làm mới ${refreshedCount} lần` : 'Chưa có hành động'}
            </div>
            <p className="text-xs text-slate-500 mt-1">Nhấn nút bên dưới để cập nhật</p>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="gap-2 text-slate-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Làm mới dữ liệu
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Welcome Card */}
      <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-blue-600 text-white">
              Khởi tạo thành công
            </Badge>
          </div>
          <CardTitle className="text-xl font-bold text-slate-900 mt-2">
            Chào mừng đến với Bảng Quản Trị AuraPhone
          </CardTitle>
          <CardDescription className="text-slate-600">
            Hệ thống quản trị cung cấp các tính năng quản lý danh mục sản phẩm, phân quyền vai trò và
            giám sát dịch vụ thương mại điện tử AuraPhone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button variant="primary">Khám phá tính năng</Button>
            <Button variant="outline">Tài liệu API</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
