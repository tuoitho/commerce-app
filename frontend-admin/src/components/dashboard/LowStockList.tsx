import React from 'react'
import { Link } from 'react-router-dom'
import type { DashboardLowStock } from '@/api/dashboard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ChevronRight } from 'lucide-react'

interface LowStockListProps {
  lowStock: DashboardLowStock
}

export const LowStockList: React.FC<LowStockListProps> = ({ lowStock }) => {
  return (
    <Card className="border-slate-200/80 shadow-xs h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Biến thể sắp hết hàng ({lowStock.total})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Các biến thể đang bán có tồn kho ≤ {lowStock.threshold}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {lowStock.items.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-center p-4">
            <p className="text-sm text-slate-500">
              Không có biến thể nào sắp hết hàng
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lowStock.items.map((item) => {
              const optionLabels = item.options.map((opt) => opt.valueLabel).join(' / ')
              const isOutOfStock = item.stockQuantity === 0

              return (
                <Link
                  key={item.variantId}
                  to={`/products/${item.productId}`}
                  data-testid={`low-stock-${item.variantId}`}
                  className="group flex items-center justify-between p-2.5 rounded-xl border border-slate-200/70 bg-white hover:bg-slate-50/80 hover:border-slate-300 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 select-none"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                      {item.productName}
                    </p>
                    {optionLabels && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {optionLabels}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isOutOfStock ? (
                      <Badge variant="destructive" className="bg-rose-600 text-white font-semibold text-xs px-2 py-0.5">
                        Hết hàng
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 font-semibold text-xs px-2 py-0.5">
                        Còn {item.stockQuantity}
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
