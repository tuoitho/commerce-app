import React from 'react'
import { Link } from 'react-router-dom'
import type { DashboardTopProduct } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatMoneyVndExact } from './formatters'
import { Flame, ImageIcon } from 'lucide-react'

interface TopProductsListProps {
  topProducts: DashboardTopProduct[]
}

export const TopProductsList: React.FC<TopProductsListProps> = ({ topProducts }) => {
  return (
    <Card className="border-slate-200/80 shadow-xs h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Sản phẩm bán chạy
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Top 5 sản phẩm có số lượng bán cao nhất trong kỳ
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {topProducts.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-center p-4">
            <p className="text-sm text-slate-500">
              Chưa có sản phẩm nào được bán trong kỳ này
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {topProducts.map((item, index) => {
              const rank = index + 1
              const content = (
                <div className="flex items-center gap-3 w-full">
                  {/* Rank */}
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      rank === 1
                        ? 'bg-amber-100 text-amber-800'
                        : rank === 2
                        ? 'bg-slate-200 text-slate-800'
                        : rank === 3
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {rank}
                  </span>

                  {/* Image */}
                  <div className="h-11 w-11 shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-slate-300" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                        {item.name}
                      </p>
                      {!item.active && (
                        <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-200 bg-rose-50 px-1.5 py-0 shrink-0">
                          Đã ngừng bán
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{item.brand}</p>
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900">
                      {item.quantitySold} cái
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatMoneyVndExact(item.revenueVnd)}
                    </p>
                  </div>
                </div>
              )

              if (!item.active) {
                return (
                  <div
                    key={item.productId}
                    data-testid={`top-product-${item.productId}`}
                    className="p-2.5 rounded-xl border border-slate-200/60 bg-slate-50/50 opacity-80 cursor-default select-none"
                  >
                    {content}
                  </div>
                )
              }

              return (
                <Link
                  key={item.productId}
                  to={`/products/${item.productId}`}
                  data-testid={`top-product-${item.productId}`}
                  className="block p-2.5 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50/80 hover:border-slate-300 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 select-none"
                >
                  {content}
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
