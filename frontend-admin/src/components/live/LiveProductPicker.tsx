import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Plus, Search } from 'lucide-react'
import { getAdminProductById, getAdminProducts } from '@/api/products'
import { formatVND } from '@/lib/utils'
import { draftFromDetail, type DraftProduct } from './liveDraft'

const MAX_LIVE_PRODUCTS = 50

interface LiveProductPickerProps {
  selectedIds: string[]
  onAdd: (product: DraftProduct) => void
}

export function LiveProductPicker({ selectedIds, onAdd }: LiveProductPickerProps) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const full = selectedIds.length >= MAX_LIVE_PRODUCTS

  const { data, isFetching } = useQuery({
    queryKey: ['admin', 'products', { q: query, page: 1, limit: 8 }],
    queryFn: () => getAdminProducts({ q: query, page: 1, limit: 8 }),
    enabled: query.trim().length > 0,
  })

  const add = async (id: string) => {
    setAdding(id)
    setError(null)
    try {
      const detail = await getAdminProductById(id)
      if (detail.active === false || !(detail.variants ?? []).some((v) => v.active)) {
        setError('Sản phẩm đã ngừng kinh doanh, không thể bán trong live')
        return
      }
      onAdd(draftFromDetail(detail))
    } catch {
      setError('Không tải được sản phẩm, vui lòng thử lại')
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={full ? 'Đã đủ 50 sản phẩm' : 'Tìm sản phẩm theo tên để thêm vào giỏ hàng live'}
          aria-label="Tìm sản phẩm"
          disabled={full}
          className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-teal-600 disabled:bg-zinc-50"
        />
        {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />}
      </label>
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      {query.trim() && data && (
        <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200 bg-white">
          {data.data.length === 0 && <li className="px-3 py-4 text-center text-sm text-zinc-500">Không tìm thấy sản phẩm</li>}
          {data.data.map((product) => {
            const already = selectedIds.includes(product.id)
            return (
              <li key={product.id} className="flex items-center gap-3 px-3 py-2">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  {product.primaryImageUrl && <img src={product.primaryImageUrl} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{product.name}</p>
                  <p className="font-mono text-xs text-zinc-500">{formatVND(product.minPriceVnd)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => add(product.id)}
                  disabled={already || full || adding !== null}
                  aria-label={`Thêm ${product.name}`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-zinc-900 px-2.5 text-xs font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-500"
                >
                  {adding === product.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {already ? 'Đã thêm' : 'Thêm'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
